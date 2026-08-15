import { getWhatsAppConfig } from "@/lib/integrations/settings";
import { normalizeIndianMobile } from "@/lib/payments/phonepe";
import { SelectOrders } from "@/lib/supabase/schema";

type SendOrderSuccessWhatsAppParams = {
  mobile: string;
  customerName?: string | null;
  orderId: string;
  amount: string;
};

const WHATSAPP_API_VERSION = "v20.0";
const WHATSAPP_REQUEST_TIMEOUT_MS = 12_000;
const WHATSAPP_MAX_RETRIES = 1;

type WhatsAppSendResult = { sent: true } | { sent: false; reason: string };

type WhatsAppTemplateBody = {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components: Array<{
      type: "body";
      parameters: Array<{ type: "text"; text: string }>;
    }>;
  };
};

type WhatsAppTextBody = {
  messaging_product: "whatsapp";
  to: string;
  type: "text";
  text: { body: string };
};

function parseWhatsAppError(payload: unknown, fallback: string) {
  const data = payload as {
    error?: { message?: string; code?: number };
  } | null;
  const message = String(data?.error?.message ?? "").trim();
  const code = data?.error?.code;
  if (message && code) return `${message} (code ${code})`;
  if (message) return message;
  return fallback;
}

async function postWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  body: WhatsAppTemplateBody | WhatsAppTextBody,
): Promise<WhatsAppSendResult> {
  const endpoint = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  for (let attempt = 0; attempt <= WHATSAPP_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      WHATSAPP_REQUEST_TIMEOUT_MS,
    );

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });

      if (res.ok) {
        return { sent: true };
      }

      const payload = (await res.json().catch(() => null)) as unknown;
      const reason = parseWhatsAppError(
        payload,
        `WhatsApp API error (${res.status})`,
      );
      const retriable = res.status >= 500 || res.status === 429;

      if (!retriable || attempt >= WHATSAPP_MAX_RETRIES) {
        return { sent: false, reason };
      }
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "AbortError" || /aborted/i.test(error.message));
      const reason = timedOut
        ? "WhatsApp request timeout"
        : error instanceof Error
          ? error.message
          : "WhatsApp request failed";
      if (attempt >= WHATSAPP_MAX_RETRIES) {
        return { sent: false, reason };
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return { sent: false, reason: "WhatsApp request failed" };
}

export async function sendOrderSuccessWhatsApp(
  params: SendOrderSuccessWhatsAppParams,
) {
  const config = await getWhatsAppConfig();
  if (!config)
    return { sent: false, reason: "whatsapp_not_configured" as const };

  const to = normalizeIndianMobile(params.mobile);
  if (!to) return { sent: false, reason: "invalid_mobile" as const };

  const templateName = config.templateName?.trim();
  const language = config.templateLanguage || "en";

  const body: WhatsAppTemplateBody | WhatsAppTextBody = templateName
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: params.customerName || "Customer" },
                { type: "text", text: params.orderId },
                { type: "text", text: params.amount },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          body: `Hi ${params.customerName || "Customer"}, your order #${params.orderId} is confirmed. Amount paid: INR ${params.amount}. Thank you for shopping with THRY.`,
        },
      };
  return postWhatsAppMessage(config.phoneNumberId, config.accessToken, body);
}

type SendSellerOrderWhatsAppParams = {
  mobile: string;
  orderId: string;
  amount: string;
  customerName?: string | null;
  customerMobile?: string | null;
};

export async function sendSellerOrderWhatsApp(
  params: SendSellerOrderWhatsAppParams,
) {
  const config = await getWhatsAppConfig();
  if (!config)
    return { sent: false, reason: "whatsapp_not_configured" as const };

  const to = normalizeIndianMobile(params.mobile);
  if (!to) return { sent: false, reason: "invalid_mobile" as const };

  const body: WhatsAppTextBody = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      body: `New paid order received.\nOrder: #${params.orderId}\nAmount: INR ${params.amount}\nCustomer: ${params.customerName || "N/A"}\nMobile: ${params.customerMobile || "N/A"}`,
    },
  };

  return postWhatsAppMessage(config.phoneNumberId, config.accessToken, body);
}

export async function sendSellerWhatsAppBulk(params: {
  orderId: string;
  amount: string;
  customerName?: string | null;
  customerMobile?: string | null;
}) {
  const config = await getWhatsAppConfig();
  if (!config || !config.notifySeller || config.sellerMobiles.length === 0) {
    return {
      sent: false as const,
      reason: "seller_notification_not_configured",
    };
  }

  const uniqueMobiles = [
    ...new Set(config.sellerMobiles.map((m) => m.trim())),
  ].filter(Boolean);

  let sentCount = 0;
  for (const mobile of uniqueMobiles) {
    const res = await sendSellerOrderWhatsApp({
      mobile,
      orderId: params.orderId,
      amount: params.amount,
      customerName: params.customerName,
      customerMobile: params.customerMobile,
    });
    if (res.sent) sentCount += 1;
  }

  return { sent: sentCount > 0, sentCount };
}

/**
 * Best-effort operational alert to the seller mobiles (plain text). Used for
 * conditions that need human attention NOW (payment amount mismatch, paid
 * order with an inventory problem). Never throws.
 */
export async function sendSellerOpsAlert(message: string) {
  try {
    const config = await getWhatsAppConfig();
    if (!config || !config.notifySeller || config.sellerMobiles.length === 0) {
      return { sent: false as const, reason: "seller_alerts_not_configured" };
    }

    let sentCount = 0;
    for (const mobile of config.sellerMobiles) {
      const to = normalizeIndianMobile(mobile);
      if (!to) continue;

      const res = await postWhatsAppMessage(
        config.phoneNumberId,
        config.accessToken,
        {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: `[Hub of Craftss ALERT]\n${message}` },
        },
      );
      if (res.sent) sentCount += 1;
    }

    return { sent: sentCount > 0, sentCount };
  } catch (error) {
    console.error("[whatsapp] seller ops alert failed:", error);
    return { sent: false as const, reason: "send_failed" };
  }
}

export async function notifyOrderWhatsAppTargets(order: SelectOrders) {
  const result = {
    customerNotified: false,
    sellerNotified: false,
  };

  if (order.customer_mobile && !order.whatsapp_notified) {
    const customerRes = await sendOrderSuccessWhatsApp({
      mobile: order.customer_mobile,
      customerName: order.name,
      orderId: order.id,
      amount: String(order.amount),
    });
    result.customerNotified = customerRes.sent;
  }

  if (!order.whatsapp_seller_notified) {
    const sellerRes = await sendSellerWhatsAppBulk({
      orderId: order.id,
      amount: String(order.amount),
      customerName: order.name,
      customerMobile: order.customer_mobile,
    });
    result.sellerNotified = sellerRes.sent;
  }

  return result;
}
