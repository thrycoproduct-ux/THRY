import crypto from "crypto";
import {
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from "./razorpay-standards";

describe("razorpay signatures", () => {
  const secret = "test_webhook_or_key_secret";

  it("accepts a valid checkout HMAC", () => {
    const razorpayOrderId = "order_abc";
    const razorpayPaymentId = "pay_xyz";
    const razorpaySignature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    expect(
      verifyRazorpayCheckoutSignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        keySecret: secret,
      }),
    ).toBe(true);
  });

  it("rejects a tampered checkout HMAC", () => {
    expect(
      verifyRazorpayCheckoutSignature({
        razorpayOrderId: "order_abc",
        razorpayPaymentId: "pay_xyz",
        razorpaySignature: "00".repeat(32),
        keySecret: secret,
      }),
    ).toBe(false);
  });

  it("accepts a valid webhook HMAC of the raw body", () => {
    const rawBody = '{"event":"payment.captured"}';
    const signature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    expect(
      verifyRazorpayWebhookSignature({
        rawBody,
        signature,
        webhookSecret: secret,
      }),
    ).toBe(true);
  });
});
