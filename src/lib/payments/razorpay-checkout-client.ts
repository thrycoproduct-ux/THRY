import {
  RAZORPAY_CHECKOUT_SCRIPT_URL,
  razorpayCheckoutSessionSchema,
  type RazorpayCheckoutSessionPayload,
} from "@/lib/payments/razorpay-standards";

export function parseRazorpayCheckoutSessionPayload(
  payload: unknown,
): RazorpayCheckoutSessionPayload {
  const parsed = razorpayCheckoutSessionSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Invalid Razorpay checkout response from server.");
  }
  return parsed.data;
}

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Razorpay checkout is only available in the browser.");
  }

  const RazorpayCtor = (
    window as Window & {
      Razorpay?: new (options: unknown) => { open: () => void };
    }
  ).Razorpay;
  if (RazorpayCtor) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${RAZORPAY_CHECKOUT_SCRIPT_URL}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Razorpay checkout script failed to load.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Razorpay checkout script failed to load."));
    document.head.appendChild(script);
  });
}

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export async function openRazorpayCheckout(params: {
  payload: RazorpayCheckoutSessionPayload;
  onDismiss?: () => void;
}): Promise<RazorpayHandlerResponse> {
  await loadRazorpayScript();

  const RazorpayCtor = (
    window as Window & {
      Razorpay?: new (options: Record<string, unknown>) => {
        open: () => void;
        on: (event: string, handler: (response: unknown) => void) => void;
      };
    }
  ).Razorpay;

  if (!RazorpayCtor) {
    throw new Error("Razorpay SDK did not initialize.");
  }

  const session = params.payload;

  return new Promise((resolve, reject) => {
    const checkout = new RazorpayCtor({
      key: session.keyId,
      amount: session.amount,
      currency: session.currency,
      name: session.name,
      description: session.description ?? "THRY order",
      order_id: session.razorpayOrderId,
      prefill: session.prefill,
      theme: { color: session.themeColor || "#c03078" },
      modal: {
        ondismiss: () => {
          params.onDismiss?.();
          reject(new Error("Payment cancelled."));
        },
      },
      handler: (response: RazorpayHandlerResponse) => {
        resolve(response);
      },
    });

    checkout.on("payment.failed", (response: unknown) => {
      const description =
        response &&
        typeof response === "object" &&
        "error" in response &&
        response.error &&
        typeof response.error === "object" &&
        "description" in response.error
          ? String(
              (response.error as { description?: string }).description ?? "",
            )
          : "";
      reject(new Error(description || "Razorpay payment failed."));
    });

    checkout.open();
  });
}
