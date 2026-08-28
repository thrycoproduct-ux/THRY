import { verifyPhonePeWebhookSignature } from "@/lib/payments/phonepe";
import { getPhonePeConfig } from "@/lib/integrations/settings";
import { syncPhonePeOrderPayment } from "@/lib/payments/orderPaymentSync";
import {
  phonePeWebhookEventKey,
  withPaymentWebhookIdempotency,
} from "@/lib/payments/webhook-idempotency";
import { withRetry } from "@/lib/resilience";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const config = await getPhonePeConfig();
  if (!config) {
    return NextResponse.json(
      { ok: false, message: "PhonePe is not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("x-verify")?.trim() ?? "";

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const responseEnvelope = String((body?.response as string) || "").trim();
  if (!responseEnvelope) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const isVerified = verifyPhonePeWebhookSignature({
    base64Response: responseEnvelope,
    signature,
    saltKey: config.saltKey,
    saltIndex: config.saltIndex,
  });

  if (!isVerified) {
    return NextResponse.json(
      { ok: false, message: "Invalid webhook signature" },
      { status: 401 },
    );
  }

  let decoded: Record<string, unknown> = {};
  try {
    decoded = JSON.parse(
      Buffer.from(responseEnvelope, "base64").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid callback payload" },
      { status: 400 },
    );
  }

  const merchantTransactionId = String(
    (body?.merchantTransactionId as string) ||
      (body?.merchantOrderId as string) ||
      (decoded?.merchantTransactionId as string) ||
      ((decoded?.data as Record<string, unknown> | undefined)
        ?.merchantTransactionId as string) ||
      (body?.transactionId as string) ||
      "",
  ).trim();

  if (!merchantTransactionId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (!merchantTransactionId.startsWith("ORD_")) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const eventId = phonePeWebhookEventKey({
    merchantTransactionId,
    rawBody,
  });

  try {
    const outcome = await withRetry(
      () =>
        withPaymentWebhookIdempotency({
          provider: "phonepe",
          eventId,
          orderId: null,
          handler: async () =>
            syncPhonePeOrderPayment({
              merchantTransactionId,
            }),
        }),
      { label: "phonepe:webhook-sync", attempts: 3 },
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
    console.error("[phonepe] webhook sync failed:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
