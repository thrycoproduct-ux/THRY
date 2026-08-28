"use client";

import type { CheckoutTelemetryEventType } from "@/lib/checkout/checkout-outcome";

type ReportCheckoutEventInput = {
  orderId: string;
  accessToken?: string | null;
  type: CheckoutTelemetryEventType;
  reason?: string | null;
};

/** Fire-and-forget checkout outcome for admin support (best-effort). */
export function reportCheckoutEvent(input: ReportCheckoutEventInput) {
  if (typeof window === "undefined") return;

  const body = JSON.stringify({
    orderId: input.orderId,
    accessToken: input.accessToken ?? null,
    type: input.type,
    reason: input.reason ?? null,
  });

  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const sent = navigator.sendBeacon(
        "/api/checkout/telemetry",
        new Blob([body], { type: "application/json" }),
      );
      if (sent) return;
    }
  } catch {
    // fall through to fetch
  }

  void fetch("/api/checkout/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
