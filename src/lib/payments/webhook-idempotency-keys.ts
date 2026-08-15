import { createHash } from "node:crypto";

export type PaymentWebhookProvider = "phonepe" | "cashfree" | "razorpay";

export function shortPayloadHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

/**
 * PhonePe often retries the same callback body. Hash the verified payload so
 * exact duplicates skip; a later COMPLETED callback with different body still runs.
 */
export function phonePeWebhookEventKey(input: {
  merchantTransactionId: string;
  rawBody: string;
}): string {
  const merchant = String(input.merchantTransactionId ?? "").trim();
  return `${merchant}:${shortPayloadHash(input.rawBody)}`;
}

/**
 * Cashfree: prefer payment/order ids from payload; fall back to body hash so
 * retries of the same delivery collide, while a new payment does not.
 */
export function cashfreeWebhookEventKey(input: {
  orderId: string;
  webhookType?: string | null;
  paymentId?: string | null;
  rawBody: string;
}): string {
  const orderId = String(input.orderId ?? "").trim();
  const type = String(input.webhookType ?? "webhook").trim() || "webhook";
  const paymentId = String(input.paymentId ?? "").trim();
  if (paymentId) return `${type}:${orderId}:${paymentId}`;
  return `${type}:${orderId}:${shortPayloadHash(input.rawBody)}`;
}

export function razorpayWebhookEventKey(input: {
  event?: string | null;
  shopOrderId: string;
  razorpayPaymentId?: string | null;
  rawBody: string;
}): string {
  const event = String(input.event ?? "webhook").trim() || "webhook";
  const shopOrderId = String(input.shopOrderId ?? "").trim();
  const paymentId = String(input.razorpayPaymentId ?? "").trim();
  if (paymentId) return `${event}:${shopOrderId}:${paymentId}`;
  return `${event}:${shopOrderId}:${shortPayloadHash(input.rawBody)}`;
}
