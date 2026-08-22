import { createOrderAccessToken } from "@/lib/auth/order-access-token";
import { siteConfig } from "@/config/site";
import { loadOrderConfirmationInput } from "@/lib/email/order-confirmation-email";
import {
  buildOrderDispatchHtml,
  buildOrderDispatchPlainText,
  buildOrderDispatchSubject,
  type OrderDispatchEmailInput,
} from "@/lib/email/order-dispatch-content";
import { getResendConfig } from "@/lib/email/resend-config";
import { mergePaymentMeta, readPaymentMeta } from "@/lib/orders/payment-meta";
import db from "@/lib/supabase/db";
import { orders, type SelectOrders } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import { Resend } from "resend";

export type OrderDispatchEmailResult = {
  sent: boolean;
  skipped?:
    | "not_configured"
    | "already_notified"
    | "no_email"
    | "error";
  error?: string;
};

function buildOrderUrl(order: Pick<SelectOrders, "id" | "createdAt">): string {
  const token = createOrderAccessToken(order.id, order.createdAt);
  const base = siteConfig.url.replace(/\/$/, "");
  return `${base}/orders/${order.id}?token=${encodeURIComponent(token)}`;
}

export async function loadOrderDispatchInput(
  order: SelectOrders,
  dispatch: {
    courierName: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    dispatchedAt: string;
  },
): Promise<OrderDispatchEmailInput | null> {
  const base = await loadOrderConfirmationInput(order);
  if (!base) return null;

  return {
    orderId: base.orderId,
    customerName: base.customerName,
    customerEmail: base.customerEmail,
    createdAt: base.createdAt,
    customerPhone: base.customerPhone,
    lineItems: base.lineItems,
    shippingAddress: base.shippingAddress,
    orderUrl: buildOrderUrl(order),
    courierName: dispatch.courierName,
    trackingNumber: dispatch.trackingNumber,
    trackingUrl: dispatch.trackingUrl,
    dispatchedAt: dispatch.dispatchedAt,
  };
}

export async function notifyOrderDispatchEmail(
  order: SelectOrders,
  dispatch: {
    courierName: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    dispatchedAt: string;
  },
): Promise<OrderDispatchEmailResult> {
  const config = getResendConfig();
  if (!config) {
    return { sent: false, skipped: "not_configured" };
  }

  const meta = readPaymentMeta(order.payment_meta);
  if (meta.dispatchEmailNotified === true) {
    return { sent: false, skipped: "already_notified" };
  }

  const input = await loadOrderDispatchInput(order, dispatch);
  if (!input) {
    return { sent: false, skipped: "no_email" };
  }

  const resend = new Resend(config.apiKey);

  try {
    const response = await resend.emails.send({
      from: config.fromEmail,
      to: input.customerEmail,
      subject: buildOrderDispatchSubject(input.orderId),
      html: buildOrderDispatchHtml(input),
      text: buildOrderDispatchPlainText(input),
      replyTo: siteConfig.email,
    });

    if (response.error) {
      throw new Error(response.error.message || "Resend send failed");
    }

    await db
      .update(orders)
      .set({
        payment_meta: mergePaymentMeta(meta, {
          dispatchEmailNotified: true,
          dispatchEmailNotifiedAt: new Date().toISOString(),
          dispatchEmailLastError: null,
        }),
      })
      .where(eq(orders.id, order.id));

    return { sent: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Order dispatch email failed";
    console.warn("[email] order dispatch failed:", message);

    await db
      .update(orders)
      .set({
        payment_meta: mergePaymentMeta(meta, {
          dispatchEmailLastAttemptAt: new Date().toISOString(),
          dispatchEmailLastError: message,
        }),
      })
      .where(eq(orders.id, order.id));

    return { sent: false, skipped: "error", error: message };
  }
}
