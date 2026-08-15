import { getRazorpayConfig } from "@/lib/integrations/settings";
import { fetchWithTimeout } from "@/lib/network/fetchWithTimeout";
import {
  RAZORPAY_API_BASE_URL,
  rupeesToPaise,
  validateRazorpayRuntimeConfig,
} from "@/lib/payments/razorpay-standards";
import { siteConfig } from "@/config/site";

export {
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from "@/lib/payments/razorpay-crypto";

const RAZORPAY_HTTP_TIMEOUT_MS = 12_000;

type CreateRazorpayPaymentParams = {
  orderId: string;
  amountInRupees: number;
  customerName?: string | null;
  customerMobile?: string | null;
  customerEmail?: string | null;
};

type RazorpayOrderResponse = {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  receipt?: string;
  notes?: Record<string, string>;
  error?: { description?: string; code?: string };
};

type RazorpayPaymentResponse = {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  method?: string;
  error?: { description?: string };
};

function basicAuthHeader(keyId: string, keySecret: string) {
  const token = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  return `Basic ${token}`;
}

async function razorpayRequest<T>(path: string, init: RequestInit): Promise<T> {
  const config = await getRazorpayConfig();
  if (!config) {
    throw new Error("Razorpay is not configured.");
  }
  const configError = validateRazorpayRuntimeConfig(config);
  if (configError) throw new Error(configError);

  const response = await fetchWithTimeout(`${RAZORPAY_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: basicAuthHeader(config.keyId, config.keySecret),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    timeoutMs: RAZORPAY_HTTP_TIMEOUT_MS,
  });

  const data = (await response.json().catch(() => ({}))) as T & {
    error?: { description?: string };
  };

  if (!response.ok) {
    throw new Error(
      data.error?.description || `Razorpay request failed (${response.status})`,
    );
  }

  return data;
}

export async function createRazorpayPayment(
  params: CreateRazorpayPaymentParams,
) {
  const config = await getRazorpayConfig();
  if (!config) return null;

  const configError = validateRazorpayRuntimeConfig(config);
  if (configError) throw new Error(configError);

  const amount = rupeesToPaise(params.amountInRupees);
  const receipt = params.orderId.slice(0, 40);

  const created = await razorpayRequest<RazorpayOrderResponse>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount,
      currency: "INR",
      receipt,
      payment_capture: 1,
      notes: {
        shop_order_id: params.orderId,
      },
    }),
  });

  const razorpayOrderId = String(created.id ?? "").trim();
  if (!razorpayOrderId.startsWith("order_")) {
    throw new Error("Razorpay did not return a valid order id.");
  }

  if (Number(created.amount) !== amount) {
    throw new Error("Razorpay order amount does not match checkout total.");
  }

  return {
    razorpayOrderId,
    keyId: config.keyId,
    amount,
    currency: "INR" as const,
    environment: config.environment,
    name: siteConfig.name,
    description: "THRY order",
    prefill: {
      name: String(params.customerName ?? "").trim() || undefined,
      email: String(params.customerEmail ?? "").trim() || undefined,
      contact: String(params.customerMobile ?? "").trim() || undefined,
    },
  };
}

export async function fetchRazorpayOrder(razorpayOrderId: string) {
  return razorpayRequest<RazorpayOrderResponse>(
    `/orders/${encodeURIComponent(razorpayOrderId)}`,
    { method: "GET" },
  );
}

export async function fetchRazorpayPayment(razorpayPaymentId: string) {
  return razorpayRequest<RazorpayPaymentResponse>(
    `/payments/${encodeURIComponent(razorpayPaymentId)}`,
    { method: "GET" },
  );
}
