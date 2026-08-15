import { resolveCheckoutPaymentProvider } from "./resolve-checkout-provider";

const cashfree = {
  clientId: "id",
  clientSecret: "secret",
  baseUrl: "https://sandbox.cashfree.com/pg",
  apiVersion: "2025-01-01",
  environment: "sandbox" as const,
  enabled: true,
};

const phonePe = {
  merchantId: "merchant",
  saltKey: "salt",
  saltIndex: "1",
  baseUrl: "https://api.phonepe.com/apis/hermes",
  enabled: true,
};

describe("resolveCheckoutPaymentProvider", () => {
  const razorpay = {
    keyId: "rzp_test_abc",
    keySecret: "secretsecretsecret",
    webhookSecret: "",
    environment: "sandbox" as const,
    enabled: true,
  };

  it("prefers Razorpay when it is configured", () => {
    expect(
      resolveCheckoutPaymentProvider({
        razorpayConfig: razorpay,
        cashfreeConfig: cashfree,
        phonePeConfig: phonePe,
      }),
    ).toBe("razorpay");
  });

  it("prefers Cashfree when both gateways are configured", () => {
    expect(
      resolveCheckoutPaymentProvider({
        razorpayConfig: null,
        cashfreeConfig: cashfree,
        phonePeConfig: phonePe,
      }),
    ).toBe("cashfree");
  });

  it("uses PhonePe when Cashfree is unavailable", () => {
    expect(
      resolveCheckoutPaymentProvider({
        razorpayConfig: null,
        cashfreeConfig: null,
        phonePeConfig: phonePe,
      }),
    ).toBe("phonepe");
  });

  it("returns null when no gateway is configured", () => {
    expect(
      resolveCheckoutPaymentProvider({
        razorpayConfig: null,
        cashfreeConfig: null,
        phonePeConfig: null,
      }),
    ).toBeNull();
  });
});
