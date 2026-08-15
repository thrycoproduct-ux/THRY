import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const RAZORPAY_API_BASE_URL = "https://api.razorpay.com/v1";
export const RAZORPAY_CHECKOUT_SCRIPT_URL =
  "https://checkout.razorpay.com/v1/checkout.js";

const KEY_ID_PATTERN = /^rzp_(test|live)_[A-Za-z0-9]+$/;

export function parseRazorpayKeyMode(
  keyId: string,
): "sandbox" | "production" | null {
  const match = KEY_ID_PATTERN.exec(String(keyId ?? "").trim());
  if (!match) return null;
  return match[1] === "live" ? "production" : "sandbox";
}

export function validateRazorpayRuntimeConfig(config: {
  keyId: string;
  keySecret: string;
  environment: "sandbox" | "production";
}): string | null {
  const keyId = String(config.keyId ?? "").trim();
  const keySecret = String(config.keySecret ?? "").trim();
  const mode = parseRazorpayKeyMode(keyId);

  if (!keyId) return "Razorpay Key ID is required.";
  if (!mode) {
    return "Razorpay Key ID must start with rzp_test_ or rzp_live_.";
  }
  if (!keySecret || keySecret.length < 16) {
    return "Razorpay Key Secret is incomplete.";
  }
  if (config.environment === "production" && mode !== "production") {
    return "Production environment requires a rzp_live_ Key ID.";
  }
  if (config.environment === "sandbox" && mode !== "sandbox") {
    return "Sandbox environment requires a rzp_test_ Key ID.";
  }
  return null;
}

export function rupeesToPaise(amountInRupees: number): number {
  if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
    throw new Error("Razorpay amount must be a positive number.");
  }
  return Math.round(amountInRupees * 100);
}

export function paiseToRupees(amountInPaise: number): number {
  if (!Number.isFinite(amountInPaise)) return Number.NaN;
  return amountInPaise / 100;
}

export const razorpayCheckoutSessionSchema = z.object({
  provider: z.literal("razorpay"),
  orderId: z.string().trim().min(1),
  accessToken: z.string().trim().min(1).optional().nullable(),
  razorpayOrderId: z
    .string()
    .trim()
    .regex(/^order_[A-Za-z0-9]+$/, "Invalid Razorpay order id"),
  keyId: z.string().trim().regex(KEY_ID_PATTERN),
  amount: z.number().int().positive(),
  currency: z.literal("INR"),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  prefill: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
      contact: z.string().optional(),
    })
    .optional(),
  themeColor: z.string().trim().optional(),
});

export type RazorpayCheckoutSessionPayload = z.infer<
  typeof razorpayCheckoutSessionSchema
>;

export const razorpayVerifyBodySchema = z.object({
  orderId: z.string().trim().min(1),
  accessToken: z.string().trim().min(1).optional().nullable(),
  razorpay_payment_id: z
    .string()
    .trim()
    .regex(/^pay_[A-Za-z0-9]+$/),
  razorpay_order_id: z
    .string()
    .trim()
    .regex(/^order_[A-Za-z0-9]+$/),
  razorpay_signature: z.string().trim().min(16),
});

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
