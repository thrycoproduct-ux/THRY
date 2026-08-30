/** User-facing checkout error copy (avoid raw Razorpay / network messages). */

export function isCheckoutPaymentCancelled(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  return /payment cancelled|payment canceled|user closed the payment|checkout cancelled|checkout canceled/i.test(
    raw,
  );
}

export function formatCheckoutErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const message = raw.trim();
  if (!message) return "Please try again.";

  if (isCheckoutPaymentCancelled(message)) {
    return "No charge was completed. Tap Check out again when ready — your cart is still here.";
  }

  if (/does not match registered website/i.test(message)) {
    return "Payment could not start for this store domain. Please try again shortly, or contact THRY support if it continues.";
  }

  if (/razorpay checkout script failed to load/i.test(message)) {
    return "Payment page could not load. Check your connection and try again.";
  }

  if (/payment window did not open/i.test(message)) {
    return "Payment window did not open. Close other apps, disable ad blockers, and retry checkout.";
  }

  return message;
}
