export type CheckoutProgressUpdate = {
  title: string;
  message: string;
  /** When true, keep checkout locked but do not cover Razorpay’s modal. */
  suppressOverlay?: boolean;
};

export function savingAddressProgress(): CheckoutProgressUpdate {
  return {
    title: "Processing checkout",
    message: "Saving your delivery details…",
  };
}

export function creatingOrderProgress(): CheckoutProgressUpdate {
  return {
    title: "Processing checkout",
    message: "Creating your order and confirming prices…",
  };
}

export function preparingPaymentProgress(): CheckoutProgressUpdate {
  return {
    title: "Processing checkout",
    message: "Loading secure payment. This may take a few seconds…",
  };
}

export function openingPaymentProgress(
  provider?: string,
): CheckoutProgressUpdate {
  const label =
    provider === "razorpay"
      ? "Razorpay"
      : provider === "cashfree"
        ? "Cashfree"
        : provider === "phonepe"
          ? "PhonePe"
          : "payment gateway";

  return {
    title: "Almost there",
    message: `Opening ${label}. Please do not close or refresh this page.`,
    // Razorpay’s iframe is a body overlay. Keep our spinner from covering it
    // on small phones while checkout.js is attaching.
    suppressOverlay: provider === "razorpay",
  };
}

export function razorpayModalOpenProgress(): CheckoutProgressUpdate {
  return {
    title: "Pay securely",
    message: "Complete payment in the Razorpay window.",
    suppressOverlay: true,
  };
}

export function confirmingPaymentProgress(): CheckoutProgressUpdate {
  return {
    title: "Payment received",
    message: "Confirming your order…",
  };
}
