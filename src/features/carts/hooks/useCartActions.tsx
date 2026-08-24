"use client";
import { useToast } from "@/components/ui/use-toast";
import { useBulkOrderGuardConfig } from "@/providers/BulkOrderGuardProvider";
import { useStockControlConfig } from "@/providers/StockControlProvider";
import { User } from "@supabase/auth-helpers-nextjs";
import { isBulkOrderQuantity } from "../constants/bulkOrder";
import useCartStore, { type OptionSelections } from "../useCartStore";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCartLineKey, buildCartVariantKey, normalizeCartSize } from "../cart-line";

type AddOpts = {
  silent?: boolean;
  size?: string;
  selections?: OptionSelections;
};

function useCartActions(
  user: User | null,
  productId: string,
  availableStock?: number | null,
) {
  const { toast } = useToast();
  const bulkOrder = useBulkOrderGuardConfig();
  const stockControl = useStockControlConfig();
  const addProductStorage = useCartStore((s) => s.addProductToCart);
  const guestCart = useCartStore((s) => s.cart);

  const supabase: SupabaseClient | null = user
    ? createSupabaseClient()
    : null;

  const authAddOrUpdateProduct = async (
    quantity: number,
    opts: AddOpts = {},
  ) => {
    if (!user || !supabase) {
      return { blockedBulk: false, added: false };
    }

    const normalizedSize = opts.size ? normalizeCartSize(opts.size) : undefined;
    const selections = opts.selections;
    const variantKey = buildCartVariantKey({
      productId,
      size: normalizedSize,
      selections,
    });
    const lineKey = buildCartLineKey({
      productId,
      size: normalizedSize,
      selections,
    });

    const { data: existingRow, error: existingErr } = await supabase
      .from("carts")
      .select("id, quantity")
      .eq("user_id", user.id)
      .eq("product_id", productId)
      .eq("variant_key", variantKey)
      .maybeSingle();

    if (existingErr) {
      if (!opts.silent) {
        toast({
          title: "Error",
          description: "Could not update cart. Please try again.",
          variant: "destructive",
        });
      }
      return { blockedBulk: false, added: false };
    }

    const currentQuantity = existingRow?.quantity ?? 0;
    const currentItem = guestCart[lineKey];
    if (
      bulkOrder.enabled &&
      isBulkOrderQuantity(currentQuantity + quantity, bulkOrder.threshold)
    ) {
      return { blockedBulk: true, added: false };
    }
    if (
      stockControl.enabled &&
      typeof availableStock === "number" &&
      currentQuantity + quantity > availableStock
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
    try {
      const nextQuantity = currentQuantity + quantity;
      if (nextQuantity <= 0) {
        if (existingRow?.id) {
          const { error: delErr } = await supabase
            .from("carts")
            .delete()
            .eq("id", existingRow.id);
          if (delErr) throw delErr;
        }
        // Keep store consistent.
        addProductStorage(productId, -currentQuantity, selections ?? normalizedSize);
        return { blockedBulk: false, added: true };
      }

      const payload: Record<string, unknown> = {
        user_id: user.id,
        product_id: productId,
        variant_key: variantKey,
        quantity: nextQuantity,
      };
      if (normalizedSize) payload.size = normalizedSize;
      if (selections && Object.keys(selections).length > 0) {
        payload.selections = selections;
      }

      if (existingRow?.id) {
        const { error: updErr } = await supabase
          .from("carts")
          .update(payload)
          .eq("id", existingRow.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from("carts").insert({
          ...payload,
        });
        if (insErr) throw insErr;
      }

      // Update local store for immediate UI + checkout.
      const sizeOrSelections =
        selections && Object.keys(selections).length > 0
          ? selections
          : normalizedSize;
      addProductStorage(productId, quantity, sizeOrSelections);

      if (!opts.silent)
        toast({ title: "Success, Added a Product to the Cart." });

      return { blockedBulk: false, added: true };
    } catch {
      if (!opts.silent) toast({ title: "Error, Unexpected Error occurred." });
      return { blockedBulk: false, added: false };
    }
  };

  const guestAddProduct = (quantity: number, opts: AddOpts = {}) => {
    const normalizedSize = opts.size ? normalizeCartSize(opts.size) : undefined;
    const selections = opts.selections;
    const variantKey = buildCartVariantKey({
      productId,
      size: normalizedSize,
      selections,
    });
    const lineKey = buildCartLineKey({
      productId,
      size: normalizedSize,
      selections,
    });
    const currentQuantity = guestCart[lineKey]?.quantity ?? 0;

    if (
      bulkOrder.enabled &&
      isBulkOrderQuantity(currentQuantity + quantity, bulkOrder.threshold)
    ) {
      return { blockedBulk: true, added: false };
    }
    if (
      stockControl.enabled &&
      typeof availableStock === "number" &&
      currentQuantity + quantity > availableStock
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
    const sizeOrSelections =
      selections && Object.keys(selections).length > 0
        ? selections
        : normalizedSize;
    addProductStorage(productId, quantity, sizeOrSelections);
    if (!opts.silent) toast({ title: "Sucess, Added a Product to the Cart." });
    return { blockedBulk: false, added: true };
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
