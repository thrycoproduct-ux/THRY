import {
  CASHFREE_PRODUCTION_BASE_URL,
  CASHFREE_SANDBOX_BASE_URL,
  normalizeCashfreeIncoming,
  normalizePhonePeIncoming,
  parseEnabledPhonePeValue,
  parseIncomingPhonePeForEnable,
  parseIncomingRazorpayForEnable,
  resolveCashfreeBaseUrl,
} from "./payment-settings";

describe("payment-settings", () => {
  it("maps production environment to the live Cashfree base URL", () => {
    expect(
      resolveCashfreeBaseUrl({
        environment: "production",
        baseUrl: CASHFREE_SANDBOX_BASE_URL,
      }),
    ).toBe(CASHFREE_PRODUCTION_BASE_URL);
  });

  it("maps sandbox environment to the sandbox Cashfree base URL", () => {
    expect(
      resolveCashfreeBaseUrl({
        environment: "sandbox",
        baseUrl: CASHFREE_PRODUCTION_BASE_URL,
      }),
    ).toBe(CASHFREE_SANDBOX_BASE_URL);
  });

  it("normalizes mismatched Cashfree environment and base URL on save", () => {
    const normalized = normalizeCashfreeIncoming({
      clientId: "cf-id",
      clientSecret: "cf-secret",
      baseUrl: CASHFREE_SANDBOX_BASE_URL,
      environment: "production",
      apiVersion: "2025-01-01",
    });

    expect(normalized.baseUrl).toBe(CASHFREE_PRODUCTION_BASE_URL);
    expect(normalized.environment).toBe("production");
  });

  it("allows saving disabled PhonePe without merchant credentials", () => {
    const normalized = normalizePhonePeIncoming({
      merchantId: "",
      saltKey: "",
      saltIndex: "",
    });

    expect(normalized.merchantId).toBe("");
    expect(parseEnabledPhonePeValue(normalized).success).toBe(false);
  });

  it("requires a live key for production Razorpay", () => {
    const parsed = parseIncomingRazorpayForEnable({
      keyId: "rzp_test_abc123",
      keySecret: "secretsecretsecret",
      environment: "production",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires complete PhonePe credentials when enabling", () => {
    const parsed = parseIncomingPhonePeForEnable({
      merchantId: "PGTEST",
      saltIndex: "1",
      saltKey: "secret",
    });

    expect(parsed.success).toBe(true);
  });
});
