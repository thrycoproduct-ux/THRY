"use client";
import { useToast } from "@/components/ui/use-toast";
import { useBulkOrderGuardConfig } from "@/providers/BulkOrderGuardProvider";
import { useStockControlConfig } from "@/providers/StockControlProvider";
import { User } from "@supabase/auth-helpers-nextjs";
import { isBulkOrderQuantity } from "../constants/bulkOrder";
import useCartStore, { type OptionSelections } from "../useCartStore";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchCartSizeConfigsByProductIds,
  shouldBlockBareCartAdd,
  type CartSizeConfigPayload,
} from "../cart-options-guard";
import { purgeStaleCartLinesAfterCompleteAdd } from "../cart-purge";
import { clearAuthCartClearedMarker } from "../cart-cleared-marker";
import {
  buildOptimisticCartLineKeys,
  getCartLineQuantity,
  purgeStaleLocalCartLinesAfterCompleteAdd,
  snapshotCart,
  syncAuthCartAfterOptimisticAdd,
} from "../optimistic-cart-add";

type AddOpts = {
  silent?: boolean;
  size?: string;
  selections?: OptionSelections;
  /** Listing-card preview — skip `/api/products/size-config` when provided. */
  sizeConfigHint?: CartSizeConfigPayload | null;
};

function scheduleAddToCartToast(
  toast: ReturnType<typeof useToast>["toast"],
  silent?: boolean,
) {
  if (silent) return;
  queueMicrotask(() => {
    toast({ title: "Success, Added a Product to the Cart." });
  });
}

function useCartActions(
  user: User | null,
  productId: string,
  availableStock?: number | null,
) {
  const { toast } = useToast();
  const bulkOrder = useBulkOrderGuardConfig();
  const stockControl = useStockControlConfig();
  const addProductStorage = useCartStore((s) => s.addProductToCart);
  const replaceCart = useCartStore((s) => s.replaceCart);
  const removeProductStorage = useCartStore((s) => s.removeProduct);
  const guestCart = useCartStore((s) => s.cart);

  const supabase: SupabaseClient | null = user ? createSupabaseClient() : null;

  const assertOptionsComplete = async (opts: AddOpts) => {
    const resolveSizeConfig = async () => {
      if (opts.sizeConfigHint !== undefined) {
        return opts.sizeConfigHint;
      }
      const configs = await fetchCartSizeConfigsByProductIds([productId]);
      return configs[productId] ?? null;
    };

    const sizeConfig = await resolveSizeConfig();
    if (
      shouldBlockBareCartAdd({
        sizeConfig,
        selections: opts.selections,
        size: opts.size,
      })
    ) {
      if (!opts.silent) {
        const optionName = String(sizeConfig?.name ?? "").trim() || "option";
        toast({
          title: `Select ${optionName} first`,
          description: `This product has ${optionName.toLowerCase()} options. Open the product page and choose before adding to cart.`,
        });
      }
      return false;
    }
    return true;
  };

  const authAddOrUpdateProduct = async (
    quantity: number,
    opts: AddOpts = {},
  ) => {
    if (!user || !supabase) {
      return { blockedBulk: false, added: false };
    }

    if (quantity > 0 && !(await assertOptionsComplete(opts))) {
      return { blockedBulk: false, added: false, blockedOptions: true };
    }

    const { normalizedSize, selections, variantKey, lineKey, sizeOrSelections } =
      buildOptimisticCartLineKeys({
        productId,
        quantity,
        size: opts.size,
        selections: opts.selections,
        sizeConfig: opts.sizeConfigHint,
      });

    const currentQuantity = getCartLineQuantity(
      guestCart,
      productId,
      normalizedSize,
      selections,
    );
    const nextQuantity = currentQuantity + quantity;

    if (
      bulkOrder.enabled &&
      isBulkOrderQuantity(nextQuantity, bulkOrder.threshold)
    ) {
      return { blockedBulk: true, added: false };
    }
    if (
      stockControl.enabled &&
      typeof availableStock === "number" &&
      nextQuantity > availableStock
    ) {
      if (!opts.silent) {
        toast({
          title: "Stock limit reached",
          description: `Only ${availableStock} left in stock for this product.`,
          variant: "destructive",
        });
      }
      return { blockedBulk: false, added: false };
    }

    const cartSnapshot = snapshotCart(useCartStore.getState().cart);

    if (quantity > 0 && opts.sizeConfigHint !== undefined) {
      purgeStaleLocalCartLinesAfterCompleteAdd({
        cart: useCartStore.getState().cart,
        productId,
        sizeConfig: opts.sizeConfigHint ?? undefined,
        keepVariantKey: variantKey,
        keepLineKey: lineKey,
        newSelections: selections,
        newSize: normalizedSize,
        removeProduct: removeProductStorage,
      });
    }

    addProductStorage(productId, quantity, sizeOrSelections);
    clearAuthCartClearedMarker();
    scheduleAddToCartToast(toast, opts.silent);

    void syncAuthCartAfterOptimisticAdd({
      supabase,
      userId: user.id,
      productId,
      variantKey,
      lineKey,
      normalizedSize,
      selections,
      sizeConfigHint: opts.sizeConfigHint,
      removeProduct: removeProductStorage,
    }).then((ok) => {
      if (ok) return;
      replaceCart(cartSnapshot);
      if (!opts.silent) {
        toast({
          title: "Could not save cart",
          description: "Your cart was rolled back. Please try again.",
          variant: "destructive",
        });
      }
    });

    return { blockedBulk: false, added: true, optimistic: true };
  };

  const guestAddProduct = async (quantity: number, opts: AddOpts = {}) => {
    if (quantity > 0 && !(await assertOptionsComplete(opts))) {
      return { blockedBulk: false, added: false, blockedOptions: true };
    }

    const { normalizedSize, selections, variantKey, lineKey, sizeOrSelections } =
      buildOptimisticCartLineKeys({
        productId,
        quantity,
        size: opts.size,
        selections: opts.selections,
        sizeConfig: opts.sizeConfigHint,
      });

    const currentQuantity = getCartLineQuantity(
      guestCart,
      productId,
      normalizedSize,
      selections,
    );
    const nextQuantity = currentQuantity + quantity;

    if (
      bulkOrder.enabled &&
      isBulkOrderQuantity(nextQuantity, bulkOrder.threshold)
    ) {
      return { blockedBulk: true, added: false };
    }
    if (
      stockControl.enabled &&
      typeof availableStock === "number" &&
      nextQuantity > availableStock
    ) {
      if (!opts.silent) {
        toast({
          title: "Stock limit reached",
          description: `Only ${availableStock} left in stock for this product.`,
          variant: "destructive",
        });
      }
      return { blockedBulk: false, added: false };
    }

    if (quantity > 0) {
      if (opts.sizeConfigHint !== undefined) {
        purgeStaleLocalCartLinesAfterCompleteAdd({
          cart: useCartStore.getState().cart,
          productId,
          sizeConfig: opts.sizeConfigHint ?? undefined,
          keepVariantKey: variantKey,
          keepLineKey: lineKey,
          newSelections: selections,
          newSize: normalizedSize,
          removeProduct: removeProductStorage,
        });
      } else {
        await purgeStaleCartLinesAfterCompleteAdd({
          supabase: null,
          userId: null,
          productId,
          keepVariantKey: variantKey,
          keepLineKey: lineKey,
          newSelections: selections,
          newSize: normalizedSize,
          cart: guestCart,
          removeProduct: removeProductStorage,
        });
      }
    }

    addProductStorage(productId, quantity, sizeOrSelections);
    scheduleAddToCartToast(toast, opts.silent);
    return { blockedBulk: false, added: true, optimistic: true };
  };

  const addProductToCart = async (
    quantity: number,
    opts: AddOpts | string = {},
  ) => {
    const normalizedOpts = typeof opts === "string" ? { size: opts } : opts;
    return !user
      ? guestAddProduct(quantity, normalizedOpts)
      : authAddOrUpdateProduct(quantity, normalizedOpts);
  };

  return { addProductToCart };
}

export default useCartActions;
