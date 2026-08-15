import type {
  CashfreeConfig,
  PhonePeConfig,
  RazorpayConfig,
} from "@/lib/integrations/settings";

export type CheckoutPaymentProvider = "razorpay" | "cashfree" | "phonepe";

/**
 * Checkout uses the single enabled Indian gateway. Razorpay wins if more
 * than one is still enabled in leftover admin data.
 */
export function resolveCheckoutPaymentProvider(input: {
  razorpayConfig?: RazorpayConfig | null;
  cashfreeConfig: CashfreeConfig | null;
  phonePeConfig: PhonePeConfig | null;
}): CheckoutPaymentProvider | null {
  if (input.razorpayConfig) return "razorpay";
  if (input.cashfreeConfig) return "cashfree";
  if (input.phonePeConfig) return "phonepe";
  return null;
}

export function checkoutProviderLabel(
  provider: CheckoutPaymentProvider,
): string {
  switch (provider) {
    case "razorpay":
      return "Razorpay";
    case "cashfree":
      return "Cashfree";
    case "phonepe":
      return "PhonePe";
    default:
      return "payment gateway";
  }
}
