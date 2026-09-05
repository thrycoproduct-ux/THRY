import { getWhatsAppConfig } from "@/lib/integrations/settings";
import { normalizeIndianMobile } from "@/lib/payments/phonepe";
import { siteConfig } from "@/config/site";

const WHATSAPP_API_VERSION = "v20.0";
const WHATSAPP_REQUEST_TIMEOUT_MS = 12_000;

type SendAbandonedCartWhatsAppParams = {
  mobile: string;
  customerName?: string | null;
  orderId: string;
  amount: string;
  paymentLink: string;
};

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

/**
 * Recover unpaid checkouts. Prefers an approved abandoned-cart template
 * (config `abandonedTemplateName` or env WHATSAPP_ABANDONED_TEMPLATE_NAME)
 * because freeform text is rejected outside the 24h customer-care window.
 */
export async function sendAbandonedCartWhatsApp(
  params: SendAbandonedCartWhatsAppParams,
): Promise<WhatsAppSendResult> {
  const config = await getWhatsAppConfig();
  if (!config) {
    return { sent: false, reason: "whatsapp_not_configured" };
  }

  const to = normalizeIndianMobile(params.mobile);
  if (!to) {
    return { sent: false, reason: "invalid_mobile" };
  }

  const name = String(params.customerName ?? "").trim() || "there";
  const amount = String(params.amount ?? "").trim() || "0";
  const paymentLink = String(params.paymentLink ?? "").trim();
  if (!paymentLink) {
    return { sent: false, reason: "missing_payment_link" };
  }

  const abandonedTemplate =
    config.abandonedTemplateName?.trim() ||
    process.env.WHATSAPP_ABANDONED_TEMPLATE_NAME?.trim() ||
    "";
  const language =
    config.abandonedTemplateLanguage?.trim() || config.templateLanguage || "en";

  const body: WhatsAppTemplateBody | WhatsAppTextBody = abandonedTemplate
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: abandonedTemplate,
          language: { code: language },
          // Expected body vars: {{1}} name, {{2}} amount, {{3}} payment link
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: name },
                { type: "text", text: amount },
                { type: "text", text: paymentLink },
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
          body: [
            `Hi ${name}!`,
            ``,
            `You left an unpaid order at ${siteConfig.name}.`,
            `Amount: ₹${amount}`,
            ``,
            `Complete payment here:`,
            paymentLink,
            ``,
            `Link expires soon. Reply if you need help.`,
          ].join("\n"),
        },
      };

  const endpoint = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${config.phoneNumberId}/messages`;
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
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });

    if (res.ok) {
      return { sent: true };
    }

    const payload = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return {
      sent: false,
      reason: payload?.error?.message || `WhatsApp API error (${res.status})`,
    };
  } catch (error) {
    return {
      sent: false,
      reason:
        error instanceof Error ? error.message : "WhatsApp request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}
