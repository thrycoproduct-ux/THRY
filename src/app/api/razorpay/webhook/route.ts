import { NextRequest, NextResponse } from "next/server";
import { getRazorpayConfig } from "@/lib/integrations/settings";
import {
  fetchRazorpayPayment,
  verifyRazorpayWebhookSignature,
} from "@/lib/payments/razorpay";
import { syncRazorpayOrderPayment } from "@/lib/payments/orderPaymentSync";
import { isLikelyRazorpayWebhookSecret } from "@/lib/payments/razorpay-webhook-secret";
import { resolveRazorpayWebhookIds } from "@/lib/payments/razorpay-webhook-payload";
import {
  razorpayWebhookEventKey,
  withPaymentWebhookIdempotency,
} from "@/lib/payments/webhook-idempotency";
import { withRetry } from "@/lib/resilience";

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

  if (!isLikelyRazorpayWebhookSecret(config.webhookSecret)) {
    console.error(
      "[razorpay] webhook secret is invalid (looks like a URL or dashboard link). Update Admin → Settings → APIs → Razorpay Webhook Secret.",
    );
    return NextResponse.json(
      {
        ok: false,
        message:
          "Razorpay webhook secret is misconfigured. Paste the secret string from Razorpay Dashboard → Webhooks (not the URL).",
      },
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

  const ids = resolveRazorpayWebhookIds(body);
  if (ids.skipped) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let razorpayOrderId = ids.razorpayOrderId;
  const razorpayPaymentId = ids.razorpayPaymentId;
  const shopOrderId = ids.shopOrderId;
  const event = ids.event;

  if (!razorpayOrderId && razorpayPaymentId) {
    const payment = await fetchRazorpayPayment(razorpayPaymentId).catch(
      () => null,
    );
    razorpayOrderId = String(payment?.order_id ?? "").trim();
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
    const outcome = await withRetry(
      () =>
        withPaymentWebhookIdempotency({
          provider: "razorpay",
          eventId,
          orderId: shopOrderId,
          handler: async () =>
            syncRazorpayOrderPayment({
              orderId: shopOrderId,
              razorpayOrderId,
              razorpayPaymentId: razorpayPaymentId || null,
            }),
        }),
      { label: "razorpay:webhook-sync", attempts: 3 },
    );

    if (outcome.status === "skipped") {
      if (outcome.reason === "in_progress") {
        return NextResponse.json(
          { ok: false, retry: true, reason: outcome.reason },
          { status: 503 },
        );
      }
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
