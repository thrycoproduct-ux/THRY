import { NextRequest, NextResponse } from "next/server";
import { getRazorpayConfig } from "@/lib/integrations/settings";
import { verifyRazorpayWebhookSignature } from "@/lib/payments/razorpay";
import { syncRazorpayOrderPayment } from "@/lib/payments/orderPaymentSync";
import {
  razorpayWebhookEventKey,
  withPaymentWebhookIdempotency,
} from "@/lib/payments/webhook-idempotency";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-razorpay-signature")?.trim() ?? "";
  const rawBody = await request.text();
  const config = await getRazorpayConfig();

  if (!config?.webhookSecret) {
    return NextResponse.json(
      { ok: false, message: "Razorpay webhook secret is not configured." },
      { status: 503 },
    );
  }

  if (!signature) {
    return NextResponse.json(
      { ok: false, message: "Missing Razorpay webhook signature." },
      { status: 400 },
    );
  }

  const isVerified = verifyRazorpayWebhookSignature({
    rawBody,
    signature,
    webhookSecret: config.webhookSecret,
  });

  if (!isVerified) {
    return NextResponse.json(
      { ok: false, message: "Invalid Razorpay webhook signature." },
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

  const event = String(body.event ?? "").trim();
  const payload = asRecord(body.payload);
  const paymentEntity = asRecord(asRecord(payload?.payment)?.entity);
  const orderEntity = asRecord(asRecord(payload?.order)?.entity);

  const razorpayPaymentId = String(paymentEntity?.id ?? "").trim();
  const razorpayOrderId = String(
    paymentEntity?.order_id ?? orderEntity?.id ?? "",
  ).trim();
  const notes = asRecord(paymentEntity?.notes) ?? asRecord(orderEntity?.notes);
  const shopOrderId = String(
    notes?.shop_order_id ?? orderEntity?.receipt ?? "",
  ).trim();

  if (
    event &&
    ![
      "payment.captured",
      "payment.authorized",
      "order.paid",
      "payment.failed",
    ].includes(event)
  ) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (!shopOrderId || !razorpayOrderId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const eventId = razorpayWebhookEventKey({
    event,
    shopOrderId,
    razorpayPaymentId: razorpayPaymentId || null,
    rawBody,
  });

  try {
    const outcome = await withPaymentWebhookIdempotency({
      provider: "razorpay",
      eventId,
      orderId: shopOrderId,
      handler: async () =>
        syncRazorpayOrderPayment({
          orderId: shopOrderId,
          razorpayOrderId,
          razorpayPaymentId: razorpayPaymentId || null,
        }),
    });

    if (outcome.status === "skipped") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[razorpay] webhook failed:", error);
    return NextResponse.json(
      { ok: false, message: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
