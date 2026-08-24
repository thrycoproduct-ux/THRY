import { create } from "zustand";
import { persistNSync } from "persist-and-sync";
import {
  buildCartLineKey,
  buildCartVariantKey,
  extractProductIdFromCartLineKey,
  normalizeCartOptionSelections,
  normalizeCartSize,
} from "./cart-line";

export type OptionSelections = Record<string, string>;

export type CartItem = {
  productId?: string;
  quantity: number;
  /** Legacy single-group selection (first group value). */
  size?: string;
  /** Multi-group selections keyed by group id. */
  selections?: OptionSelections;
  variantKey?: string;
  cartId?: string;
};

export type CartItems = { [lineKey: string]: CartItem };
export type ProductData = { productId: string; quantity: number };

type CartStore = {
  cart: CartItems;
  addProductToCart: (
    id: string,
    quantity: number,
    sizeOrSelections?: string | OptionSelections,
  ) => void;
  setProductQuantity: (
    lineKey: string,
    quantity: number,
    sizeOrSelections?: string | OptionSelections,
  ) => void;
  setProductSize: (lineKey: string, size: string) => void;
  setProductSelections: (lineKey: string, selections: OptionSelections) => void;
  replaceCart: (cart: CartItems) => void;
  removeProduct: (lineKey: string) => void;
  removeAllProducts: () => void;
};

function normalizeSelections(
  sizeOrSelections?: string | OptionSelections,
  existing?: CartItem,
): Pick<CartItem, "size" | "selections"> {
  if (sizeOrSelections && typeof sizeOrSelections === "object") {
    const selections = normalizeCartOptionSelections(sizeOrSelections);
    const first = Object.values(selections)[0];
    return {
      selections,
      ...(first ? { size: first } : {}),
    };
  }

  if (typeof sizeOrSelections === "string" && sizeOrSelections.trim()) {
    const size = normalizeCartSize(sizeOrSelections);
    return {
      ...(size ? { size } : {}),
      selections: existing?.selections,
    };
  }

  return {
    ...(existing?.size ? { size: existing.size } : {}),
    ...(existing?.selections ? { selections: existing.selections } : {}),
  };
}

function normalizeCartEntry(lineKey: string, item: CartItem): [string, CartItem] | null {
  const quantity = Number(item?.quantity ?? 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const productId = extractProductIdFromCartLineKey(lineKey, item?.productId);
  if (!productId) return null;

  const size = normalizeCartSize(item?.size);
  const selections = normalizeCartOptionSelections(item?.selections);
  const normalizedLineKey = buildCartLineKey({
    productId,
    size,
    selections,
  });

  return [
    normalizedLineKey,
    {
      productId,
      quantity,
      ...(size ? { size } : {}),
      ...(Object.keys(selections).length > 0 ? { selections } : {}),
      variantKey: buildCartVariantKey({ size, selections }),
      ...(item?.cartId ? { cartId: item.cartId } : {}),
    },
  ];
}

export function normalizeCart(cart: CartItems): CartItems {
  const normalized: CartItems = {};
  for (const [lineKey, item] of Object.entries(cart ?? {})) {
    const entry = normalizeCartEntry(lineKey, item);
    if (!entry) continue;
    const [normalizedLineKey, normalizedItem] = entry;
    const existing = normalized[normalizedLineKey];
    if (existing) {
      normalized[normalizedLineKey] = {
        ...existing,
        quantity: existing.quantity + normalizedItem.quantity,
      };
      continue;
    }
    normalized[normalizedLineKey] = normalizedItem;
  }
  return normalized;
}

const useCartStore = create<CartStore>(
  persistNSync(
    (set) => ({
      cart: {},
      addProductToCart: (id, quantity, sizeOrSelections) => {
        set((state) => {
          const normalizedInput = normalizeSelections(sizeOrSelections);
          const lineKey = buildCartLineKey({
            productId: id,
            size: normalizedInput.size,
            selections: normalizedInput.selections,
          });
          const existingProduct = state.cart[lineKey];
          if (!existingProduct && quantity <= 0) return state;

          const newQuantity = existingProduct
            ? existingProduct.quantity + quantity
            : quantity;

          if (newQuantity <= 0) {
            const updatedCart = { ...state.cart };
            delete updatedCart[lineKey];
            return { cart: updatedCart };
          }

          const normalized = normalizeSelections(sizeOrSelections, existingProduct);
          return {
            cart: {
              ...state.cart,
              [lineKey]: {
                productId: id,
                quantity: newQuantity,
                ...normalized,
                variantKey: buildCartVariantKey(normalized),
                ...(existingProduct?.cartId ? { cartId: existingProduct.cartId } : {}),
              },
            },
          };
        });
      },
      setProductQuantity: (lineKey, quantity, sizeOrSelections) =>
        set((state) => {
          if (quantity <= 0) {
            const updatedCart = { ...state.cart };
            delete updatedCart[lineKey];
            return { cart: updatedCart };
          }
          const existingProduct = state.cart[lineKey];
          const productId = extractProductIdFromCartLineKey(
            lineKey,
            existingProduct?.productId,
          );
          const normalized = normalizeSelections(sizeOrSelections, existingProduct);
          const nextLineKey = buildCartLineKey({
            productId,
            size: normalized.size,
            selections: normalized.selections,
          });
          const updatedCart = { ...state.cart };
          delete updatedCart[lineKey];
          return {
            cart: normalizeCart({
              ...updatedCart,
              [nextLineKey]: {
                productId,
                quantity,
                ...normalized,
                variantKey: buildCartVariantKey(normalized),
                ...(existingProduct?.cartId ? { cartId: existingProduct.cartId } : {}),
              },
            }),
          };
        }),
      setProductSize: (lineKey, size) =>
        set((state) => {
          const existingProduct = state.cart[lineKey];
          const productId = extractProductIdFromCartLineKey(
            lineKey,
            existingProduct?.productId,
          );
          const normalized = normalizeCartSize(size);
          const nextLineKey = buildCartLineKey({
            productId,
            size: normalized,
            selections: existingProduct?.selections,
          });
          const updatedCart = { ...state.cart };
          delete updatedCart[lineKey];
          return {
            cart: normalizeCart({
              ...updatedCart,
              [nextLineKey]: {
                productId,
                quantity: existingProduct?.quantity ?? 0,
                ...(normalized ? { size: normalized } : {}),
                ...(existingProduct?.selections
                  ? { selections: existingProduct.selections }
                  : {}),
                variantKey: buildCartVariantKey({
                  size: normalized,
                  selections: existingProduct?.selections,
                }),
                ...(existingProduct?.cartId ? { cartId: existingProduct.cartId } : {}),
              },
            }),
          };
        }),
      setProductSelections: (lineKey, selections) =>
        set((state) => {
          const existingProduct = state.cart[lineKey];
          const productId = extractProductIdFromCartLineKey(
            lineKey,
            existingProduct?.productId,
          );
          const normalized = normalizeSelections(selections, existingProduct);
          const nextLineKey = buildCartLineKey({
            productId,
            size: normalized.size,
            selections: normalized.selections,
          });
          const updatedCart = { ...state.cart };
          delete updatedCart[lineKey];
          return {
            cart: normalizeCart({
              ...updatedCart,
              [nextLineKey]: {
                productId,
                quantity: existingProduct?.quantity ?? 0,
                ...normalized,
                variantKey: buildCartVariantKey(normalized),
                ...(existingProduct?.cartId ? { cartId: existingProduct.cartId } : {}),
              },
            }),
          };
        }),
      replaceCart: (cart) => set({ cart: normalizeCart(cart) }),
      removeProduct: (lineKey) =>
        set((state) => {
          const updatedCart = { ...state.cart };
          delete updatedCart[lineKey];
          return {
            cart: updatedCart,
          };
        }),
      removeAllProducts: () => set(() => ({ cart: {} })),
    }),
    { name: "cart", storage: "cookies" },
  ),
);

export const calcProductCountStorage = (cartItems: CartItems) => {
  if (!cartItems) return 0;
  return Object.values(cartItems).reduce((acc, cur) => acc + cur.quantity, 0);
};

export default useCartStore;
