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
import { classifyCheckoutError } from "@/lib/checkout/checkout-outcome";
import { reportCheckoutEvent } from "@/lib/checkout/report-checkout-event.client";
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

const DISMISS_POLL_DELAY_MS = 3000;
const DISMISS_POLL_TIMEOUT_MS = 8000;

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
  let checkoutContext: {
    orderId: string;
    accessToken: string | null;
  } | null = null;

  const reportFailure = (err: unknown) => {
    if (!checkoutContext) return;
    const classified = classifyCheckoutError(err);
    reportCheckoutEvent({
      orderId: checkoutContext.orderId,
      accessToken: checkoutContext.accessToken,
      type: classified.type,
      reason: classified.reason,
    });
  };

  onProgress?.(creatingOrderProgress());
  // Dismiss the keyboard/focus trap now, but do not block order creation on it —
  // openRazorpayCheckout awaits the same prep right before it opens the modal.
  void prepareHostPageForRazorpayModal();
  // Official checkout.js from Razorpay CDN — start while the order is created.
  void ensureRazorpayCheckoutScript().catch(() => undefined);

  try {
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
      checkoutContext = {
        orderId: session.orderId,
        accessToken: session.accessToken ?? null,
      };
      onProgress?.(openingPaymentProgress("razorpay"));

      let razorpayResult: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      };

      try {
        razorpayResult = await openRazorpayCheckout({
          payload: session,
          onOpened: () => {
            onProgress?.(razorpayModalOpenProgress());
            reportCheckoutEvent({
              orderId: session.orderId,
              accessToken: session.accessToken ?? null,
              type: "razorpay_modal_opened",
            });
          },
        });
      } catch (dismissError) {
        if (
          dismissError instanceof Error &&
          /cancelled/i.test(dismissError.message)
        ) {
          // UPI may still be processing — wait briefly then check server status
          const isPaid = await pollOrderPaidStatus(
            session.orderId,
            session.accessToken ?? null,
          );
          if (isPaid) {
            const redirect = session.accessToken
              ? `/orders/${session.orderId}?token=${encodeURIComponent(session.accessToken)}`
              : `/orders/${session.orderId}`;
            window.location.assign(redirect);
            return;
          }
        }
        throw dismissError;
      }

      onProgress?.(confirmingPaymentProgress());
      const verifyRes = await fetchWithTimeout("/api/razorpay/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: session.orderId,
          accessToken: session.accessToken ?? null,
          razorpay_payment_id: razorpayResult.razorpay_payment_id,
          razorpay_order_id: razorpayResult.razorpay_order_id,
          razorpay_signature: razorpayResult.razorpay_signature,
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
      reportCheckoutEvent({
        orderId: session.orderId,
        accessToken: session.accessToken ?? null,
        type: "payment_confirmed",
      });
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
  } catch (error) {
    reportFailure(error);
    throw error;
  }
}

/**
 * After Razorpay modal dismiss, wait briefly and check if a background
 * webhook/recovery already marked the order paid (common UPI scenario).
 */
async function pollOrderPaidStatus(
  orderId: string,
  accessToken: string | null,
): Promise<boolean> {
  await new Promise((r) => setTimeout(r, DISMISS_POLL_DELAY_MS));
  try {
    const params = new URLSearchParams({ orderId });
    if (accessToken) params.set("token", accessToken);
    const res = await fetchWithTimeout(
      `/api/orders/payment-status?${params.toString()}`,
      { method: "GET", timeoutMs: DISMISS_POLL_TIMEOUT_MS },
    );
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as {
      isPaid?: boolean;
    } | null;
    return data?.isPaid === true;
  } catch {
    return false;
  }
}
