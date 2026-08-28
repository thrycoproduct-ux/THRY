import { verifyCashfreeWebhookSignature } from "@/lib/payments/cashfree";
import { syncCashfreeOrderPayment } from "@/lib/payments/orderPaymentSync";
import {
  cashfreeWebhookEventKey,
  withPaymentWebhookIdempotency,
} from "@/lib/payments/webhook-idempotency";
import { withRetry } from "@/lib/resilience";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-webhook-signature")?.trim() ?? "";
  const timestamp = request.headers.get("x-webhook-timestamp")?.trim() ?? "";
  if (!signature || !timestamp) {
    return NextResponse.json(
      { ok: false, message: "Missing webhook signature headers" },
      { status: 400 },
    );
  }

  const rawBody = await request.text();
  const isVerified = await verifyCashfreeWebhookSignature({
    rawBody,
    timestamp,
    signature,
  }).catch(() => false);

  if (!isVerified) {
    return NextResponse.json(
      { ok: false, message: "Invalid webhook signature" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(rawBody || "{}") as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const rawData = body?.data as Record<string, unknown> | undefined;
  const orderEntity = rawData?.order as Record<string, unknown> | undefined;
  const paymentEntity = rawData?.payment as Record<string, unknown> | undefined;
  const orderId = String(
    (orderEntity?.order_id as string) ||
      (rawData?.order_id as string) ||
      (body?.order_id as string) ||
      "",
  ).trim();

  if (!orderId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const webhookType = String(body?.type ?? body?.event ?? "webhook").trim();
  const paymentId = String(
    (paymentEntity?.cf_payment_id as string) ||
      (paymentEntity?.payment_id as string) ||
      (rawData?.cf_payment_id as string) ||
      "",
  ).trim();

  const eventId = cashfreeWebhookEventKey({
    orderId,
    webhookType,
    paymentId: paymentId || null,
    rawBody,
  });

  try {
    const outcome = await withRetry(
      () =>
        withPaymentWebhookIdempotency({
          provider: "cashfree",
          eventId,
          orderId,
          handler: async () => syncCashfreeOrderPayment(orderId),
        }),
      { label: "cashfree:webhook-sync", attempts: 3 },
    );

    if (outcome.status === "skipped") {
      // Another delivery is mid-flight. If it crashes, a 200 here would end
      // gateway retries and the order could stay unpaid forever — ask the
      // gateway to retry instead; the duplicate resolves to 200 once done.
      if (outcome.reason === "in_progress") {
        return NextResponse.json(
          { ok: false, retry: true, reason: outcome.reason },
          { status: 503 },
        );
      }
      return NextResponse.json({
        ok: true,
        duplicate: true,
        reason: outcome.reason,
      });
    }

    return NextResponse.json({ ok: true, ...outcome.result });
  } catch (error) {
    console.error("[cashfree] webhook sync failed:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
