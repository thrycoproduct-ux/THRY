import { normalizeCart, type CartItems } from "@/features/carts/useCartStore";
import { extractProductIdFromCartLineKey } from "@/features/carts/cart-line";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

const CART_COOKIE_NAME = "cart";

/** Read guest cart product IDs from the persist-and-sync cookie (same shape as Zustand). */
export function readGuestCartItemsFromCookies(
  cookieStore: ReadonlyRequestCookies,
): CartItems {
  const raw = cookieStore.get(CART_COOKIE_NAME)?.value;
  if (!raw) return {};

  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as { cart?: CartItems };
    const cart = parsed?.cart;
    if (!cart || typeof cart !== "object") return {};
    return normalizeCart(cart);
  } catch {
    try {
      const parsed = JSON.parse(raw) as { cart?: CartItems };
      return parsed?.cart && typeof parsed.cart === "object"
        ? normalizeCart(parsed.cart)
        : {};
    } catch {
      return {};
    }
  }
}

export function guestCartProductIds(cart: CartItems): string[] {
  return [...new Set(
    Object.entries(cart)
      .map(([lineKey, item]) =>
        extractProductIdFromCartLineKey(lineKey, item?.productId),
      )
      .filter(Boolean),
  )];
}
