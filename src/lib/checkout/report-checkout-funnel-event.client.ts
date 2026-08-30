"use client";

import { clarityEvent, type ClarityFunnelEvent } from "@/lib/analytics/clarity-client";
import {
  getOrCreateFunnelSessionId,
  type CheckoutFunnelEventType,
} from "@/lib/checkout/checkout-funnel";

type ReportFunnelEventInput = {
  type: CheckoutFunnelEventType;
  reason?: string | null;
  orderId?: string | null;
};

/** Fire Clarity + server funnel beacon (works before orderId exists). */
export function reportCheckoutFunnelEvent(input: ReportFunnelEventInput) {
  if (typeof window === "undefined") return;

  clarityEvent(input.type as ClarityFunnelEvent, input.reason ?? undefined);

  const body = JSON.stringify({
    funnelSessionId: getOrCreateFunnelSessionId(),
    type: input.type,
    reason: input.reason ?? null,
    orderId: input.orderId ?? null,
    path: window.location.pathname,
  });

  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const sent = navigator.sendBeacon(
        "/api/checkout/funnel",
        new Blob([body], { type: "application/json" }),
      );
      if (sent) return;
    }
  } catch {
    // fall through
  }

  void fetch("/api/checkout/funnel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
