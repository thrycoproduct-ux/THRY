"use client";
import { useToast } from "@/components/ui/use-toast";
import { useBulkOrderGuardConfig } from "@/providers/BulkOrderGuardProvider";
import { useStockControlConfig } from "@/providers/StockControlProvider";
import { User } from "@supabase/auth-helpers-nextjs";
import { useMutation, useQuery } from "@urql/next";
import { FetchCartQuery } from "../components/UserCartSection";
import { createCartMutation, updateCartsMutation } from "../query";
import { isBulkOrderQuantity } from "../constants/bulkOrder";
import useCartStore, { type OptionSelections } from "../useCartStore";

type AddOpts = {
  silent?: boolean;
  size?: string;
  selections?: OptionSelections;
};

function selectionsEqual(
  a?: OptionSelections | null,
  b?: OptionSelections | null,
) {
  const left = a ?? {};
  const right = b ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (
      String(left[key] ?? "")
        .trim()
        .toUpperCase() !==
      String(right[key] ?? "")
        .trim()
        .toUpperCase()
    ) {
      return false;
    }
  }
  return true;
}

function useCartActions(
  user: User | null,
  productId: string,
  availableStock?: number | null,
) {
  const { toast } = useToast();
  const bulkOrder = useBulkOrderGuardConfig();
  const stockControl = useStockControlConfig();
  const [, addToCart] = useMutation(createCartMutation);
  const [, updateCart] = useMutation(updateCartsMutation);
  const addProductStorage = useCartStore((s) => s.addProductToCart);
  const setProductSize = useCartStore((s) => s.setProductSize);
  const setProductSelections = useCartStore((s) => s.setProductSelections);
  const guestCart = useCartStore((s) => s.cart);

  const [{ data }, refetch] = useQuery({
    query: FetchCartQuery,
    variables: {
      userId: user ? user.id : undefined,
    },
  });

  const authAddOrUpdateProduct = async (
    quantity: number,
    opts: AddOpts = {},
  ) => {
    const size = opts.size;
    const selections = opts.selections;
    const existedProduct = data?.cartsCollection?.edges?.find(
      ({ node }) => node.product_id === productId,
    );
    const currentQuantity = existedProduct?.node.quantity ?? 0;
    const currentItem = guestCart[productId];
    const hasConflict =
      currentQuantity > 0 &&
      ((selections &&
        currentItem?.selections &&
        !selectionsEqual(currentItem.selections, selections)) ||
        (size &&
          currentItem?.size &&
          !selections &&
          currentItem.size !== size));
    if (hasConflict) {
      if (!opts.silent) {
        toast({
          title: "Option mismatch",
          description:
            "This product is already in cart with a different option. Remove it first, then add the new choice.",
          variant: "destructive",
        });
      }
      return { blockedBulk: false, added: false };
    }
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
      let res;
      if (!existedProduct) {
        res = await addToCart({
          productId,
          userId: user!.id,
          quantity,
        });
        refetch({ requestPolicy: "network-only" });
      } else {
        res = await updateCart({
          productId,
          userId: user!.id,
          newQuantity: existedProduct.node.quantity + quantity,
        });
        refetch({ requestPolicy: "network-only" });
      }
      if (selections && Object.keys(selections).length > 0) {
        setProductSelections(productId, selections);
      } else if (size) {
        setProductSize(productId, size);
      }
      if (res && !res.error && !opts.silent)
        toast({ title: "Success, Added a Product to the Cart." });
      return { blockedBulk: false, added: true };
    } catch {
      if (!opts.silent) toast({ title: "Error, Unexpected Error occurred." });
      return { blockedBulk: false, added: false };
    }
  };

  const guestAddProduct = (quantity: number, opts: AddOpts = {}) => {
    const size = opts.size;
    const selections = opts.selections;
    const currentQuantity = guestCart[productId]?.quantity ?? 0;
    const currentItem = guestCart[productId];
    const hasConflict =
      currentQuantity > 0 &&
      ((selections &&
        currentItem?.selections &&
        !selectionsEqual(currentItem.selections, selections)) ||
        (size &&
          currentItem?.size &&
          !selections &&
          currentItem.size !== size));
    if (hasConflict) {
      if (!opts.silent) {
        toast({
          title: "Option mismatch",
          description:
            "This product is already in cart with a different option. Remove it first, then add the new choice.",
          variant: "destructive",
        });
      }
      return { blockedBulk: false, added: false };
    }
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
    addProductStorage(productId, quantity, selections ?? size);
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
