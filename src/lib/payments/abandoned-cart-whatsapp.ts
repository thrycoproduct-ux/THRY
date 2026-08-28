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
  const message = [
    `Hi ${name}! 👋`,
    ``,
    `You left something in your cart at ${siteConfig.name}.`,
    ``,
    `Order amount: ₹${params.amount}`,
    ``,
    `Complete your purchase now:`,
    params.paymentLink,
    ``,
    `This link expires in 23 hours. Need help? Just reply to this message.`,
  ].join("\n");

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
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      }),
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
      reason:
        payload?.error?.message || `WhatsApp API error (${res.status})`,
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
