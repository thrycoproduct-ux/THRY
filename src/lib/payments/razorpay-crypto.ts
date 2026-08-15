import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyRazorpayCheckoutSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  keySecret: string;
}): boolean {
  const expected = createHmac("sha256", params.keySecret)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest("hex");

  const actual = String(params.razorpaySignature ?? "").trim();
  if (!expected || !actual || expected.length !== actual.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(actual, "utf8"),
    );
  } catch {
    return false;
  }
}

export function verifyRazorpayWebhookSignature(params: {
  rawBody: string;
  signature: string;
  webhookSecret: string;
}): boolean {
  const secret = String(params.webhookSecret ?? "").trim();
  const actual = String(params.signature ?? "").trim();
  if (!secret || !actual) return false;

  const expected = createHmac("sha256", secret)
    .update(params.rawBody)
    .digest("hex");

  if (expected.length !== actual.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(actual, "utf8"),
    );
  } catch {
    return false;
  }
}
