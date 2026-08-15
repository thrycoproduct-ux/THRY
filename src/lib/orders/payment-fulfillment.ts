import {
  getCashfreeConfig,
  getIntegrationSetting,
  getPhonePeConfig,
  getRazorpayConfig,
  INTEGRATION_KEYS,
} from "@/lib/integrations/settings";

export type PaymentFulfillmentContext = {
  paymentProvider: string | null | undefined;
  paymentMeta?: Record<string, unknown> | null;
};

function normalizeProvider(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export async function shouldDeductStockForPaidOrder(
  context: PaymentFulfillmentContext,
): Promise<boolean> {
  const stockControlSetting = await getIntegrationSetting(
    INTEGRATION_KEYS.stockControl,
  );
  if (!stockControlSetting?.isEnabled) return false;

  const provider = normalizeProvider(context.paymentProvider);
  const metaEnvironment = String(context.paymentMeta?.paymentEnvironment ?? "")
    .trim()
    .toLowerCase();

  if (metaEnvironment === "sandbox" || metaEnvironment === "test") {
    return false;
  }
  if (metaEnvironment === "production") {
    return true;
  }

  if (provider === "razorpay") {
    const config = await getRazorpayConfig();
    return config?.environment === "production";
  }

  if (provider === "cashfree") {
    const config = await getCashfreeConfig();
    return config?.environment === "production";
  }

  if (provider === "phonepe") {
    const config = await getPhonePeConfig();
    if (!config) return false;
    const baseUrl = config.baseUrl.toLowerCase();
    return (
      !baseUrl.includes("sandbox") &&
      !baseUrl.includes("preprod") &&
      !baseUrl.includes("uat")
    );
  }

  return false;
}
