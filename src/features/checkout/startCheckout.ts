import type { CartItems } from "@/features/carts";
import type { SavedShippingAddress } from "@/features/addresses/validations/addressFormSchema";
import type { CheckoutProgressUpdate } from "@/features/checkout/checkout-progress";
import {
  creatingOrderProgress,
  openingPaymentProgress,
  preparingPaymentProgress,
  confirmingPaymentProgress,
  razorpayModalOpenProgress,
} from "@/features/checkout/checkout-progress";
import { fetchWithTimeout } from "@/lib/network/fetchWithTimeout";
import {
  openCashfreeCheckout,
  parseCashfreeCheckoutSessionPayload,
} from "@/lib/payments/cashfree-checkout-client";
import {
  ensureRazorpayCheckoutScript,
  openRazorpayCheckout,
  parseRazorpayCheckoutSessionPayload,
  prepareHostPageForRazorpayModal,
} from "@/lib/payments/razorpay-checkout-client";

type StartCheckoutParams = {
  order: CartItems;
  guest: boolean;
  shipping: SavedShippingAddress;
  promoCode?: string | null;
  onProgress?: (update: CheckoutProgressUpdate) => void;
};

const CHECKOUT_SESSION_TIMEOUT_MS = 45_000;

export async function startCheckout({
  order,
  guest,
  shipping,
  promoCode,
  onProgress,
}: StartCheckoutParams) {
  onProgress?.(creatingOrderProgress());
  await prepareHostPageForRazorpayModal();
  // Official checkout.js from Razorpay CDN — start while the order is created.
  void ensureRazorpayCheckoutScript().catch(() => undefined);

  const res = await fetchWithTimeout("/api/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderProducts: order,
      guest,
      shipping: {
        addressId: shipping.addressId,
        fullName: shipping.fullName,
        email: shipping.email,
        mobile: shipping.mobile,
        state: shipping.state,
      },
      promoCode: promoCode ?? null,
    }),
    timeoutMs: CHECKOUT_SESSION_TIMEOUT_MS,
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    const message = payload?.message || "Checkout failed";
    throw new Error(message);
  }

  const payload = (await res.json()) as Record<string, unknown>;

  if (payload.provider === "razorpay") {
    onProgress?.(preparingPaymentProgress());
    const session = parseRazorpayCheckoutSessionPayload(payload);
    onProgress?.(openingPaymentProgress("razorpay"));
    const result = await openRazorpayCheckout({
      payload: session,
      onOpened: () => {
        onProgress?.(razorpayModalOpenProgress());
      },
    });
    onProgress?.(confirmingPaymentProgress());
    const verifyRes = await fetchWithTimeout("/api/razorpay/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: session.orderId,
        accessToken: session.accessToken ?? null,
        razorpay_payment_id: result.razorpay_payment_id,
        razorpay_order_id: result.razorpay_order_id,
        razorpay_signature: result.razorpay_signature,
      }),
      timeoutMs: CHECKOUT_SESSION_TIMEOUT_MS,
    });
    const verifyPayload = (await verifyRes.json().catch(() => null)) as {
      message?: string;
      redirect?: string;
      isPaid?: boolean;
      ok?: boolean;
    } | null;
    if (!verifyRes.ok) {
      throw new Error(
        verifyPayload?.message || "Could not confirm Razorpay payment.",
      );
    }
    if (verifyPayload?.isPaid !== true) {
      throw new Error(
        verifyPayload?.message ||
          "Payment received by Razorpay but not confirmed on THRY yet. Please wait a moment or contact support with your order id.",
      );
    }
    const redirect =
      String(verifyPayload?.redirect ?? "").trim() ||
      (session.accessToken
        ? `/orders/${session.orderId}?token=${encodeURIComponent(session.accessToken)}`
        : `/orders/${session.orderId}`);
    window.location.assign(redirect);
    return;
  }

  if (payload.provider === "cashfree") {
    onProgress?.(preparingPaymentProgress());
    const session = parseCashfreeCheckoutSessionPayload(payload);
    onProgress?.(openingPaymentProgress("cashfree"));
    openCashfreeCheckout({ payload: session });
    return;
  }

  if (payload.provider === "phonepe") {
    const redirectUrl = String(payload.redirectUrl ?? "").trim();
    if (!redirectUrl) {
      throw new Error("PhonePe checkout could not be started.");
    }
    onProgress?.(openingPaymentProgress("phonepe"));
    window.location.assign(redirectUrl);
    return;
  }

  throw new Error("Unsupported payment provider.");
}
