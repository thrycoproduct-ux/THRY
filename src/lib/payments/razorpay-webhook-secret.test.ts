import {
  isLikelyRazorpayWebhookSecret,
  razorpayWebhookSecretValidationMessage,
} from "./razorpay-webhook-secret";

describe("razorpay webhook secret validation", () => {
  it("accepts a normal webhook secret string", () => {
    expect(isLikelyRazorpayWebhookSecret("whsec_abc123XYZ")).toBe(true);
    expect(isLikelyRazorpayWebhookSecret("MyWebhookSecret99")).toBe(true);
  });

  it("rejects dashboard URLs and empty values", () => {
    expect(isLikelyRazorpayWebhookSecret("")).toBe(false);
    expect(
      isLikelyRazorpayWebhookSecret(
        "https://dashboard.razorpay.com/app/webhooks/TPy22zW5ngSIqq",
      ),
    ).toBe(false);
    expect(isLikelyRazorpayWebhookSecret("https://thryco.com/api/razorpay/webhook")).toBe(
      false,
    );
    expect(isLikelyRazorpayWebhookSecret("short")).toBe(false);
  });

  it("explains URL mistakes clearly", () => {
    expect(
      razorpayWebhookSecretValidationMessage(
        "https://dashboard.razorpay.com/app/webhooks/TPy22zW5ngSIqq",
      ),
    ).toMatch(/not the dashboard URL/i);
  });
});
