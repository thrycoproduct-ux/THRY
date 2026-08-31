import type { SupabaseClient } from "@supabase/supabase-js";
import {
  areCartSelectionsComplete,
  type CartSizeConfigPayload,
} from "@/features/carts/cart-options-guard";
import {
  purgeStaleAuthCartLinesForProduct,
  purgeStaleStorageCartLinesForProduct,
} from "@/features/carts/cart-purge";
import {
  buildCartLineKey,
  buildCartVariantKey,
  normalizeCartSize,
} from "@/features/carts/cart-line";
import type { CartItems, OptionSelections } from "@/features/carts/useCartStore";
import useCartStore from "@/features/carts/useCartStore";
import { clearAuthCartClearedMarker } from "@/features/carts/cart-cleared-marker";

export type OptimisticCartAddInput = {
  productId: string;
  quantity: number;
  size?: string;
  selections?: OptionSelections;
  sizeConfig?: CartSizeConfigPayload | null;
};

export function getCartLineQuantity(
  cart: CartItems,
  productId: string,
  size?: string,
  selections?: OptionSelections,
): number {
  const lineKey = buildCartLineKey({
    productId,
    size: size ? normalizeCartSize(size) : undefined,
    selections,
  });
  return cart[lineKey]?.quantity ?? 0;
}

/** Remove stale incomplete lines locally before a complete variant add (sync). */
export function purgeStaleLocalCartLinesAfterCompleteAdd(args: {
  cart: CartItems;
  productId: string;
  sizeConfig: CartSizeConfigPayload | undefined;
  keepVariantKey: string;
  keepLineKey: string;
  newSelections?: OptionSelections | null;
  newSize?: string | null;
  removeProduct: (lineKey: string) => void;
}): void {
  if (
    !areCartSelectionsComplete({
      sizeConfig: args.sizeConfig,
      selections: args.newSelections,
      size: args.newSize,
    })
  ) {
    return;
  }

  const staleKeys = purgeStaleStorageCartLinesForProduct({
    cart: args.cart,
    productId: args.productId,
    sizeConfig: args.sizeConfig,
    keepVariantKey: args.keepVariantKey,
    keepLineKey: args.keepLineKey,
    newSelections: args.newSelections,
    newSize: args.newSize,
  });

  for (const lineKey of staleKeys) {
    args.removeProduct(lineKey);
  }
}

export function snapshotCart(cart: CartItems): CartItems {
  return JSON.parse(JSON.stringify(cart)) as CartItems;
}

export async function persistAuthCartLineInBackground(args: {
  supabase: SupabaseClient;
  userId: string;
  productId: string;
  variantKey: string;
  lineKey: string;
  normalizedSize?: string;
  selections?: OptionSelections;
  sizeConfig?: CartSizeConfigPayload | null;
}): Promise<boolean> {
  try {
    if (args.sizeConfig) {
      await purgeStaleAuthCartLinesForProduct({
        supabase: args.supabase,
        userId: args.userId,
        productId: args.productId,
        sizeConfig: args.sizeConfig,
        keepVariantKey: args.variantKey,
        newSelections: args.selections,
        newSize: args.normalizedSize ?? null,
      });
    }

    const localQty =
      useCartStore.getState().cart[args.lineKey]?.quantity ?? 0;

    const { data: existingRow, error: existingErr } = await args.supabase
      .from("carts")
      .select("id")
      .eq("user_id", args.userId)
      .eq("product_id", args.productId)
      .eq("variant_key", args.variantKey)
      .maybeSingle();

    if (existingErr) return false;

    if (localQty <= 0) {
      if (existingRow?.id) {
        const { error: delErr } = await args.supabase
          .from("carts")
          .delete()
          .eq("id", existingRow.id);
        if (delErr) return false;
      }
      return true;
    }

    const payload: Record<string, unknown> = {
      user_id: args.userId,
      product_id: args.productId,
      variant_key: args.variantKey,
      quantity: localQty,
    };
    if (args.normalizedSize) payload.size = args.normalizedSize;
    if (args.selections && Object.keys(args.selections).length > 0) {
      payload.selections = args.selections;
    }

    if (existingRow?.id) {
      const { error: updErr } = await args.supabase
        .from("carts")
        .update(payload)
        .eq("id", existingRow.id);
      if (updErr) return false;
    } else {
      const { error: insErr } = await args.supabase.from("carts").insert(payload);
      if (insErr) return false;
    }

    clearAuthCartClearedMarker();
    return true;
  } catch {
    return false;
  }
}

export async function syncAuthCartAfterOptimisticAdd(args: {
  supabase: SupabaseClient;
  userId: string;
  productId: string;
  variantKey: string;
  lineKey: string;
  normalizedSize?: string;
  selections?: OptionSelections;
  sizeConfigHint?: CartSizeConfigPayload | null;
  removeProduct: (lineKey: string) => void;
}): Promise<boolean> {
  let sizeConfig = args.sizeConfigHint;
  if (sizeConfig === undefined) {
    const { fetchCartSizeConfigsByProductIds } = await import(
      "@/features/carts/cart-options-guard"
    );
    const configs = await fetchCartSizeConfigsByProductIds([args.productId]);
    sizeConfig = configs[args.productId] ?? null;
  }

  purgeStaleLocalCartLinesAfterCompleteAdd({
    cart: useCartStore.getState().cart,
    productId: args.productId,
    sizeConfig: sizeConfig ?? undefined,
    keepVariantKey: args.variantKey,
    keepLineKey: args.lineKey,
    newSelections: args.selections,
    newSize: args.normalizedSize ?? null,
    removeProduct: args.removeProduct,
  });

  return persistAuthCartLineInBackground({
    supabase: args.supabase,
    userId: args.userId,
    productId: args.productId,
    variantKey: args.variantKey,
    lineKey: args.lineKey,
    normalizedSize: args.normalizedSize,
    selections: args.selections,
    sizeConfig,
  });
}

export function buildOptimisticCartLineKeys(input: OptimisticCartAddInput) {
  const normalizedSize = input.size
    ? normalizeCartSize(input.size)
    : undefined;
  const selections = input.selections;
  const variantKey = buildCartVariantKey({
    productId: input.productId,
    size: normalizedSize,
    selections,
  });
  const lineKey = buildCartLineKey({
    productId: input.productId,
    size: normalizedSize,
    selections,
  });
  const sizeOrSelections =
    selections && Object.keys(selections).length > 0
      ? selections
      : normalizedSize;

  return {
    normalizedSize,
    selections,
    variantKey,
    lineKey,
    sizeOrSelections,
  };
}
