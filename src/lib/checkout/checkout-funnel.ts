/**
 * Pre-order funnel beacons (no orderId yet).
 * Server logs structured JSON for Vercel/ops; Clarity carries the UX signal.
 */

export const CHECKOUT_FUNNEL_EVENT_TYPES = [
  "cart_view",
  "checkout_click",
  "checkout_pin_blocked",
  "checkout_size_blocked",
  "checkout_address_open",
  "checkout_session_ok",
  "checkout_session_fail",
  "rzp_script_ok",
  "rzp_script_fail",
  "payment_open",
  "rzp_open_timeout",
  "rzp_modal_dwell_ms",
  "payment_failed",
  "payment_cancel",
  "payment_paid",
] as const;

export type CheckoutFunnelEventType =
  (typeof CHECKOUT_FUNNEL_EVENT_TYPES)[number];

const FUNNEL_SESSION_KEY = "thry_checkout_funnel_sid";

export function getOrCreateFunnelSessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(FUNNEL_SESSION_KEY)?.trim();
    if (existing && existing.length >= 8) return existing.slice(0, 64);
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(FUNNEL_SESSION_KEY, id);
    return id;
  } catch {
    return `f${Date.now().toString(36)}`;
  }
}

export function isCheckoutFunnelEventType(
  value: string,
): value is CheckoutFunnelEventType {
  return (CHECKOUT_FUNNEL_EVENT_TYPES as readonly string[]).includes(value);
}
