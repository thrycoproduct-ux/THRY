import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCartVariantKey, extractProductIdFromCartLineKey } from "./cart-line";
import {
  areCartSelectionsComplete,
  fetchCartSizeConfigsByProductIds,
  shouldPurgeStaleCartLineWhenAdding,
  type CartSizeConfigPayload,
} from "./cart-options-guard";
import type { CartItems, OptionSelections } from "./useCartStore";

type AuthCartRow = {
  id: string;
  variant_key: string | null;
  selections: OptionSelections | null;
  size: string | null;
};

export async function purgeStaleAuthCartLinesForProduct(args: {
  supabase: SupabaseClient;
  userId: string;
  productId: string;
  sizeConfig: CartSizeConfigPayload | undefined;
  keepVariantKey: string;
  newSelections?: OptionSelections | null;
  newSize?: string | null;
}): Promise<string[]> {
  const { data, error } = await args.supabase
    .from("carts")
    .select("id, variant_key, selections, size")
    .eq("user_id", args.userId)
    .eq("product_id", args.productId);

  if (error || !data?.length) return [];

  const removedIds: string[] = [];
  for (const row of data as AuthCartRow[]) {
    if (
      !shouldPurgeStaleCartLineWhenAdding({
        sizeConfig: args.sizeConfig,
        existingVariantKey: row.variant_key,
        existingSelections: row.selections,
        existingSize: row.size,
        keepVariantKey: args.keepVariantKey,
        newSelections: args.newSelections,
        newSize: args.newSize,
      })
    ) {
      continue;
    }
    const { error: delErr } = await args.supabase
      .from("carts")
      .delete()
      .eq("id", row.id);
    if (!delErr) removedIds.push(row.id);
  }
  return removedIds;
}

/** Remove matching stale lines from the persisted cookie cart. */
export function purgeStaleStorageCartLinesForProduct(args: {
  cart: CartItems;
  productId: string;
  sizeConfig: CartSizeConfigPayload | undefined;
  keepVariantKey: string;
  keepLineKey: string;
  newSelections?: OptionSelections | null;
  newSize?: string | null;
}): string[] {
  const removedKeys: string[] = [];
  for (const [lineKey, item] of Object.entries(args.cart)) {
    if (lineKey === args.keepLineKey) continue;
    const productId = extractProductIdFromCartLineKey(lineKey, item?.productId);
    if (productId !== args.productId) continue;

    const existingVariantKey = buildCartVariantKey({
      size: item?.size,
      selections: item?.selections,
    });

    if (
      shouldPurgeStaleCartLineWhenAdding({
        sizeConfig: args.sizeConfig,
        existingVariantKey,
        existingSelections: item?.selections,
        existingSize: item?.size ?? null,
        keepVariantKey: args.keepVariantKey,
        newSelections: args.newSelections,
        newSize: args.newSize,
      })
    ) {
      removedKeys.push(lineKey);
    }
  }
  return removedKeys;
}

export async function purgeStaleCartLinesAfterCompleteAdd(args: {
  supabase: SupabaseClient | null;
  userId: string | null;
  productId: string;
  keepVariantKey: string;
  keepLineKey: string;
  newSelections?: OptionSelections | null;
  newSize?: string | null;
  cart: CartItems;
  removeProduct: (lineKey: string) => void;
}): Promise<void> {
  const configs = await fetchCartSizeConfigsByProductIds([args.productId]);
  const sizeConfig = configs[args.productId];
  if (
    !areCartSelectionsComplete({
      sizeConfig,
      selections: args.newSelections,
      size: args.newSize,
    })
  ) {
    return;
  }

  if (args.supabase && args.userId) {
    await purgeStaleAuthCartLinesForProduct({
      supabase: args.supabase,
      userId: args.userId,
      productId: args.productId,
      sizeConfig,
      keepVariantKey: args.keepVariantKey,
      newSelections: args.newSelections,
      newSize: args.newSize,
    });
  }

  const staleKeys = purgeStaleStorageCartLinesForProduct({
    cart: args.cart,
    productId: args.productId,
    sizeConfig,
    keepVariantKey: args.keepVariantKey,
    keepLineKey: args.keepLineKey,
    newSelections: args.newSelections,
    newSize: args.newSize,
  });
  for (const lineKey of staleKeys) {
    args.removeProduct(lineKey);
  }
}
