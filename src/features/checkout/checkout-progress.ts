export type CheckoutProgressUpdate = {
  title: string;
  message: string;
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
  };
}
