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

  const candidates = [raw];
  try {
    candidates.unshift(decodeURIComponent(raw));
  } catch {
    /* raw may already be decoded JSON */
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { cart?: CartItems };
      if (!parsed?.cart || typeof parsed.cart !== "object") continue;
      return normalizeCart(parsed.cart);
    } catch {
      /* try next candidate */
    }
  }
  return null;
}
