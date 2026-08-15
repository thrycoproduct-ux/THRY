import { createId } from "@paralleldrive/cuid2";
import db from "@/lib/supabase/db";
import { paymentWebhookEvents } from "@/lib/supabase/schema";
import { and, eq, lt } from "drizzle-orm";
import type { PaymentWebhookProvider } from "@/lib/payments/webhook-idempotency-keys";

export type { PaymentWebhookProvider } from "@/lib/payments/webhook-idempotency-keys";
export {
  cashfreeWebhookEventKey,
  phonePeWebhookEventKey,
  razorpayWebhookEventKey,
  shortPayloadHash,
} from "@/lib/payments/webhook-idempotency-keys";

export type WebhookClaimResult =
  | { claimed: true; claimId: string }
  | {
      claimed: false;
      reason: "already_processed" | "in_progress";
      claimId: string;
    };

const STALE_PROCESSING_MS = 5 * 60 * 1000;

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: string }).code ?? "");
  if (code === "23505") return true;
  const message = String((error as { message?: string }).message ?? "");
  return (
    message.includes("payment_webhook_events_provider_event_uid") ||
    message.toLowerCase().includes("duplicate key")
  );
}

/**
 * Atomically claim a webhook delivery. Concurrent duplicates lose the race and
 * return claimed:false. Stale "processing" rows (>5m) can be reclaimed after a crash.
 */
export async function claimPaymentWebhookEvent(input: {
  provider: PaymentWebhookProvider;
  eventId: string;
  orderId?: string | null;
}): Promise<WebhookClaimResult> {
  const provider = input.provider;
  const eventId = String(input.eventId ?? "").trim();
  if (!eventId) {
    throw new Error("Webhook event id is required for idempotency.");
  }

  const claimId = createId();
  const nowIso = new Date().toISOString();

  try {
    await db.insert(paymentWebhookEvents).values({
      id: claimId,
      provider,
      eventId,
      status: "processing",
      orderId: input.orderId ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    return { claimed: true, claimId };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  const [existing] = await db
    .select()
    .from(paymentWebhookEvents)
    .where(
      and(
        eq(paymentWebhookEvents.provider, provider),
        eq(paymentWebhookEvents.eventId, eventId),
      ),
    )
    .limit(1);

  if (!existing) {
    await db.insert(paymentWebhookEvents).values({
      id: claimId,
      provider,
      eventId,
      status: "processing",
      orderId: input.orderId ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    return { claimed: true, claimId };
  }

  if (existing.status === "processed") {
    return {
      claimed: false,
      reason: "already_processed",
      claimId: existing.id,
    };
  }

  const updatedAtMs = Date.parse(existing.updatedAt);
  const isStale =
    existing.status === "processing" &&
    Number.isFinite(updatedAtMs) &&
    Date.now() - updatedAtMs > STALE_PROCESSING_MS;

  if (isStale) {
    const staleBefore = new Date(
      Date.now() - STALE_PROCESSING_MS,
    ).toISOString();
    const reclaimed = await db
      .update(paymentWebhookEvents)
      .set({
        status: "processing",
        updatedAt: nowIso,
        errorMessage: null,
        orderId: input.orderId ?? existing.orderId,
      })
      .where(
        and(
          eq(paymentWebhookEvents.id, existing.id),
          eq(paymentWebhookEvents.status, "processing"),
          lt(paymentWebhookEvents.updatedAt, staleBefore),
        ),
      )
      .returning({ id: paymentWebhookEvents.id });

    if (reclaimed[0]?.id) {
      return { claimed: true, claimId: existing.id };
    }
  }

  if (existing.status === "failed") {
    const retried = await db
      .update(paymentWebhookEvents)
      .set({
        status: "processing",
        updatedAt: nowIso,
        errorMessage: null,
        orderId: input.orderId ?? existing.orderId,
      })
      .where(
        and(
          eq(paymentWebhookEvents.id, existing.id),
          eq(paymentWebhookEvents.status, "failed"),
        ),
      )
      .returning({ id: paymentWebhookEvents.id });

    if (retried[0]?.id) {
      return { claimed: true, claimId: existing.id };
    }
  }

  return {
    claimed: false,
    reason: "in_progress",
    claimId: existing.id,
  };
}

export async function completePaymentWebhookEvent(input: {
  claimId: string;
  orderId?: string | null;
}) {
  const nowIso = new Date().toISOString();
  await db
    .update(paymentWebhookEvents)
    .set({
      status: "processed",
      processedAt: nowIso,
      updatedAt: nowIso,
      orderId: input.orderId ?? null,
      errorMessage: null,
    })
    .where(eq(paymentWebhookEvents.id, input.claimId));
}

export async function failPaymentWebhookEvent(input: {
  claimId: string;
  error: unknown;
  orderId?: string | null;
}) {
  const message =
    input.error instanceof Error
      ? input.error.message.slice(0, 500)
      : String(input.error ?? "Webhook processing failed").slice(0, 500);
  const nowIso = new Date().toISOString();
  await db
    .update(paymentWebhookEvents)
    .set({
      status: "failed",
      updatedAt: nowIso,
      errorMessage: message,
      orderId: input.orderId ?? undefined,
    })
    .where(eq(paymentWebhookEvents.id, input.claimId));
}

/** Run handler under claim/complete/fail. Returns skipped when duplicate. */
export async function withPaymentWebhookIdempotency<T>(input: {
  provider: PaymentWebhookProvider;
  eventId: string;
  orderId?: string | null;
  handler: () => Promise<T>;
}): Promise<
  | { status: "processed"; result: T; claimId: string }
  | {
      status: "skipped";
      reason: "already_processed" | "in_progress";
      claimId: string;
    }
> {
  const claim = await claimPaymentWebhookEvent({
    provider: input.provider,
    eventId: input.eventId,
    orderId: input.orderId,
  });

  if (claim.claimed === false) {
    return {
      status: "skipped",
      reason: claim.reason,
      claimId: claim.claimId,
    };
  }

  try {
    const result = await input.handler();
    const resultOrderId =
      result &&
      typeof result === "object" &&
      "orderId" in result &&
      typeof (result as { orderId?: unknown }).orderId === "string"
        ? (result as { orderId: string }).orderId
        : input.orderId;
    await completePaymentWebhookEvent({
      claimId: claim.claimId,
      orderId: resultOrderId ?? null,
    });
    return { status: "processed", result, claimId: claim.claimId };
  } catch (error) {
    await failPaymentWebhookEvent({
      claimId: claim.claimId,
      error,
      orderId: input.orderId,
    }).catch(() => undefined);
    throw error;
  }
}
