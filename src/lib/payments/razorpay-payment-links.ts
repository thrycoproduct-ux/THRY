import { getRazorpayConfig } from "@/lib/integrations/settings";
import { fetchWithTimeout } from "@/lib/network/fetchWithTimeout";
import {
  RAZORPAY_API_BASE_URL,
  rupeesToPaise,
  validateRazorpayRuntimeConfig,
} from "@/lib/payments/razorpay-standards";
import { toInternationalPhoneDigits } from "@/lib/contact/phone";
import { siteConfig } from "@/config/site";
import { createOrderAccessToken } from "@/lib/auth/order-access-token";

const RAZORPAY_HTTP_TIMEOUT_MS = 12_000;

type CreatePaymentLinkParams = {
  orderId: string;
  amountInRupees: number;
  customerName?: string | null;
  customerMobile?: string | null;
  customerEmail?: string | null;
  description?: string;
  expireInMinutes?: number;
  notifySms?: boolean;
  notifyEmail?: boolean;
  createdAt?: string | Date | null;
};

type PaymentLinkResponse = {
  id: string;
  short_url: string;
  amount: number;
  currency: string;
  status: string;
  expire_by?: number;
};

export async function createRazorpayPaymentLink(
  params: CreatePaymentLinkParams,
): Promise<PaymentLinkResponse | null> {
  const config = await getRazorpayConfig();
  if (!config) return null;

  const configError = validateRazorpayRuntimeConfig(config);
  if (configError) throw new Error(configError);

  const amount = rupeesToPaise(params.amountInRupees);
  const contact = toInternationalPhoneDigits(params.customerMobile);
  const expireMinutes = Math.max(params.expireInMinutes ?? 1440, 16);
  const expireBy = Math.floor(Date.now() / 1000) + expireMinutes * 60;

  let callbackUrl = `${siteConfig.url}/orders/${params.orderId}`;
  if (params.createdAt) {
    try {
      const token = createOrderAccessToken(params.orderId, params.createdAt);
      callbackUrl = `${callbackUrl}?token=${encodeURIComponent(token)}`;
    } catch {
      // Guest token is best-effort; logged-in customers can still open /orders.
    }
  }

  const body: Record<string, unknown> = {
    amount,
    currency: "INR",
    accept_partial: false,
    reference_id: params.orderId.slice(0, 40),
    description:
      params.description || `Complete your ${siteConfig.name} order`,
    expire_by: expireBy,
    customer: {
      name: String(params.customerName ?? "").trim() || undefined,
      email: String(params.customerEmail ?? "").trim() || undefined,
      contact: contact ? `+${contact}` : undefined,
    },
    notify: {
      sms: Boolean(params.notifySms) && Boolean(contact),
      email: Boolean(params.notifyEmail) && Boolean(params.customerEmail),
    },
    reminder_enable: true,
    notes: {
      shop_order_id: params.orderId,
      source: "abandoned_cart_recovery",
    },
    callback_url: callbackUrl,
    callback_method: "get",
  };

  const token = Buffer.from(`${config.keyId}:${config.keySecret}`).toString(
    "base64",
  );

  const response = await fetchWithTimeout(
    `${RAZORPAY_API_BASE_URL}/payment_links`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeoutMs: RAZORPAY_HTTP_TIMEOUT_MS,
    },
  );

  const data = (await response.json().catch(() => ({}))) as PaymentLinkResponse & {
    error?: { description?: string };
  };

  if (!response.ok) {
    throw new Error(
      data.error?.description ||
        `Razorpay payment link creation failed (${response.status})`,
    );
  }

  return data;
}
