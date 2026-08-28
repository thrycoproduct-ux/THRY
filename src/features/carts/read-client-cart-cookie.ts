import { normalizeCart, type CartItems } from "./useCartStore";

const CART_COOKIE_NAME = "cart";

/** Read persisted cart cookie on the client (same shape as Zustand persistNSync). */
export function readClientCartCookie(): CartItems | null {
  if (typeof document === "undefined") return null;

  const raw = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${CART_COOKIE_NAME}=`))
    ?.split("=")
    .slice(1)
    .join("=");

  if (!raw) return null;

  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as { cart?: CartItems };
    if (!parsed?.cart || typeof parsed.cart !== "object") return null;
    return normalizeCart(parsed.cart);
  } catch {
    try {
      const parsed = JSON.parse(raw) as { cart?: CartItems };
      if (!parsed?.cart || typeof parsed.cart !== "object") return null;
      return normalizeCart(parsed.cart);
    } catch {
      return null;
    }
  }
}
