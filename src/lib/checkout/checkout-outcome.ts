import { readPaymentMeta } from "@/lib/orders/payment-meta";

export const CHECKOUT_TELEMETRY_EVENT_TYPES = [
  "checkout_session_failed",
  "razorpay_modal_opened",
  "payment_cancelled",
  "payment_failed",
  "razorpay_script_failed",
  "verify_failed",
  "verify_held",
  "payment_confirmed",
  "razorpay_webhook_failed",
] as const;

export type CheckoutTelemetryEventType =
  (typeof CHECKOUT_TELEMETRY_EVENT_TYPES)[number];

export type CheckoutTelemetryEvent = {
  at: string;
  type: CheckoutTelemetryEventType;
  reason: string | null;
  source: "client" | "server";
};

export type CheckoutTelemetryState = {
  lastEvent: CheckoutTelemetryEventType;
  lastReason: string | null;
  lastAt: string;
  events: CheckoutTelemetryEvent[];
};

export type CheckoutOutcomeKind =
  | "payment_failed"
  | "payment_cancelled"
  | "checkout_error"
  | "abandoned"
  | "in_progress"
  | "unknown";

export type CheckoutOutcome = {
  kind: CheckoutOutcomeKind;
  label: string;
  detail: string | null;
};

export function readCheckoutTelemetry(
  paymentMeta: unknown,
): CheckoutTelemetryState | null {
  const meta = readPaymentMeta(paymentMeta);
  const raw = meta.checkoutTelemetry;
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  const lastEvent = String(record.lastEvent ?? "").trim();
  if (
    !CHECKOUT_TELEMETRY_EVENT_TYPES.includes(
      lastEvent as CheckoutTelemetryEventType,
    )
  ) {
    return null;
  }

  const events = Array.isArray(record.events)
    ? record.events
        .map((entry) => normalizeTelemetryEvent(entry))
        .filter((entry): entry is CheckoutTelemetryEvent => entry !== null)
    : [];

  return {
    lastEvent: lastEvent as CheckoutTelemetryEventType,
    lastReason:
      typeof record.lastReason === "string" ? record.lastReason : null,
    lastAt: String(record.lastAt ?? ""),
    events,
  };
}

function normalizeTelemetryEvent(
  value: unknown,
): CheckoutTelemetryEvent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = String(record.type ?? "").trim();
  if (
    !CHECKOUT_TELEMETRY_EVENT_TYPES.includes(type as CheckoutTelemetryEventType)
  ) {
    return null;
  }

  return {
    at: String(record.at ?? ""),
    type: type as CheckoutTelemetryEventType,
    reason:
      typeof record.reason === "string" && record.reason.trim()
        ? record.reason.trim()
        : null,
    source: record.source === "server" ? "server" : "client",
  };
}

function outcomeFromTelemetryEvent(
  event: CheckoutTelemetryEventType,
  reason: string | null,
): CheckoutOutcome {
  switch (event) {
    case "payment_failed":
    case "razorpay_webhook_failed":
      return {
        kind: "payment_failed",
        label: "Payment failed",
        detail: reason ?? "Bank or UPI declined the payment.",
      };
    case "payment_cancelled":
      return {
        kind: "payment_cancelled",
        label: "Cancelled",
        detail: reason ?? "Customer closed the Razorpay window.",
      };
    case "razorpay_script_failed":
    case "checkout_session_failed":
    case "verify_failed":
    case "verify_held":
      return {
        kind: "checkout_error",
        label: "Checkout error",
        detail: reason ?? "Payment could not be completed on THRY.",
      };
    case "razorpay_modal_opened":
      return {
        kind: "in_progress",
        label: "Payment opened",
        detail: reason ?? "Razorpay opened; no outcome recorded yet.",
      };
    case "payment_confirmed":
      return {
        kind: "unknown",
        label: "Confirmed",
        detail: reason,
      };
    default:
      return {
        kind: "unknown",
        label: "Unknown",
        detail: reason,
      };
  }
}

/** Best label for unpaid admin rows — telemetry first, then Razorpay sync meta. */
export function resolveCheckoutOutcome(input: {
  paymentStatus: string;
  paymentMeta: unknown;
}): CheckoutOutcome | null {
  const paymentStatus = input.paymentStatus.trim().toLowerCase();
  if (["paid", "success", "captured"].includes(paymentStatus)) {
    return null;
  }

  const meta = readPaymentMeta(input.paymentMeta);
  const telemetry = readCheckoutTelemetry(meta);
  if (telemetry) {
    return outcomeFromTelemetryEvent(telemetry.lastEvent, telemetry.lastReason);
  }

  const razorpayPaymentStatus = String(
    meta.razorpayPaymentStatus ?? "",
  ).toLowerCase();
  const razorpayOrderStatus = String(meta.razorpayOrderStatus ?? "").toLowerCase();
  const failureReason =
    String(meta.razorpayFailureReason ?? "").trim() || null;

  if (razorpayPaymentStatus === "failed") {
    return {
      kind: "payment_failed",
      label: "Payment failed",
      detail: failureReason ?? "Bank or UPI declined the payment.",
    };
  }

  if (razorpayOrderStatus === "created") {
    return {
      kind: "abandoned",
      label: "Abandoned",
      detail: "Opened Razorpay but did not attempt payment.",
    };
  }

  if (razorpayOrderStatus === "attempted") {
    return {
      kind: "abandoned",
      label: "Abandoned",
      detail: "Payment was not completed.",
    };
  }

  return {
    kind: "unknown",
    label: "No payment",
    detail: "Checkout started; outcome not recorded yet.",
  };
}

export function classifyCheckoutError(err: unknown): {
  type: CheckoutTelemetryEventType;
  reason: string;
} {
  const message = (
    err instanceof Error ? err.message : String(err ?? "")
  ).trim();

  if (/payment cancelled/i.test(message)) {
    return { type: "payment_cancelled", reason: message };
  }

  if (
    /razorpay checkout script failed|razorpay sdk did not initialize/i.test(
      message,
    )
  ) {
    return {
      type: "razorpay_script_failed",
      reason: message,
    };
  }

  if (/could not confirm razorpay payment|verify/i.test(message)) {
    return { type: "verify_failed", reason: message };
  }

  if (/held for review|amount mismatch/i.test(message)) {
    return { type: "verify_held", reason: message };
  }

  if (/razorpay payment failed|payment failed/i.test(message)) {
    return { type: "payment_failed", reason: message };
  }

  return {
    type: "checkout_session_failed",
    reason: message || "Checkout failed.",
  };
}
