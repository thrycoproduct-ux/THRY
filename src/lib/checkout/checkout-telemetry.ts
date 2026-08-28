import { mergePaymentMeta, readPaymentMeta } from "@/lib/orders/payment-meta";
import db from "@/lib/supabase/db";
import { orders } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  CHECKOUT_TELEMETRY_EVENT_TYPES,
  readCheckoutTelemetry,
  type CheckoutTelemetryEvent,
  type CheckoutTelemetryEventType,
  type CheckoutTelemetryState,
} from "@/lib/checkout/checkout-outcome";

export {
  CHECKOUT_TELEMETRY_EVENT_TYPES,
  classifyCheckoutError,
  readCheckoutTelemetry,
  resolveCheckoutOutcome,
  type CheckoutOutcome,
  type CheckoutOutcomeKind,
  type CheckoutTelemetryEvent,
  type CheckoutTelemetryEventType,
  type CheckoutTelemetryState,
} from "@/lib/checkout/checkout-outcome";

const MAX_EVENTS = 20;

export const checkoutTelemetryBodySchema = z.object({
  orderId: z.string().trim().min(1),
  accessToken: z.string().trim().nullable().optional(),
  type: z.enum(CHECKOUT_TELEMETRY_EVENT_TYPES),
  reason: z.string().trim().max(500).nullable().optional(),
});

export async function appendCheckoutTelemetryEvent(input: {
  orderId: string;
  type: CheckoutTelemetryEventType;
  reason?: string | null;
  source?: "client" | "server";
}) {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, input.orderId),
  });
  if (!order) {
    throw new Error("Order not found for checkout telemetry.");
  }

  const meta = readPaymentMeta(order.payment_meta);
  const existing = readCheckoutTelemetry(meta);
  const at = new Date().toISOString();
  const reason =
    typeof input.reason === "string" && input.reason.trim()
      ? input.reason.trim().slice(0, 500)
      : null;

  const event: CheckoutTelemetryEvent = {
    at,
    type: input.type,
    reason,
    source: input.source ?? "server",
  };

  const events = [...(existing?.events ?? []), event].slice(-MAX_EVENTS);
  const nextState: CheckoutTelemetryState = {
    lastEvent: event.type,
    lastReason: reason,
    lastAt: at,
    events,
  };

  await db
    .update(orders)
    .set({
      payment_meta: mergePaymentMeta(meta, {
        checkoutTelemetry: nextState,
      }),
    })
    .where(eq(orders.id, input.orderId));
}
