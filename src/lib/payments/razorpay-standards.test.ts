import {
  parseRazorpayKeyMode,
  rupeesToPaise,
  validateRazorpayRuntimeConfig,
  razorpayCheckoutSessionSchema,
} from "./razorpay-standards";

describe("razorpay-standards", () => {
  it("detects test and live key modes", () => {
    expect(parseRazorpayKeyMode("rzp_test_abc123")).toBe("sandbox");
    expect(parseRazorpayKeyMode("rzp_live_abc123")).toBe("production");
    expect(parseRazorpayKeyMode("cf_live_abc")).toBeNull();
  });

  it("rejects live keys in sandbox and test keys in production", () => {
    expect(
      validateRazorpayRuntimeConfig({
        keyId: "rzp_test_abc123",
        keySecret: "secretsecretsecret",
        environment: "production",
      }),
    ).toMatch(/rzp_live_/);

    expect(
      validateRazorpayRuntimeConfig({
        keyId: "rzp_live_abc123",
        keySecret: "secretsecretsecret",
        environment: "sandbox",
      }),
    ).toMatch(/rzp_test_/);
  });

  it("converts rupees to paise", () => {
    expect(rupeesToPaise(222.25)).toBe(22225);
  });

  it("accepts a valid checkout session payload", () => {
    const parsed = razorpayCheckoutSessionSchema.parse({
      provider: "razorpay",
      orderId: "ord_1",
      razorpayOrderId: "order_IluGWxBm9U8zJ8",
      keyId: "rzp_test_abc123",
      amount: 50000,
      currency: "INR",
      name: "THRY",
    });
    expect(parsed.razorpayOrderId).toBe("order_IluGWxBm9U8zJ8");
  });
});
