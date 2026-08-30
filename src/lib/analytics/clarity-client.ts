/** Client helpers for Microsoft Clarity (safe no-ops when tag absent). */

export type ClarityFunnelEvent =
  | "cart_view"
  | "checkout_click"
  | "checkout_pin_blocked"
  | "checkout_size_blocked"
  | "checkout_address_open"
  | "checkout_session_ok"
  | "checkout_session_fail"
  | "payment_open"
  | "payment_cancel"
  | "payment_paid";

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

export function claritySetPage(pathname: string) {
  if (typeof window === "undefined") return;
  try {
    window.clarity?.("set", "page", pathname);
  } catch {
    // ignore
  }
}

export function clarityEvent(name: ClarityFunnelEvent, data?: string) {
  if (typeof window === "undefined") return;
  try {
    if (data) {
      window.clarity?.("event", name);
      window.clarity?.("set", name, data);
    } else {
      window.clarity?.("event", name);
    }
  } catch {
    // ignore
  }
}
