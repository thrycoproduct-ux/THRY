import { createOrderAccessToken } from "@/lib/auth/order-access-token";
import { siteConfig } from "@/config/site";
import {
  buildOrderConfirmationHtml,
  buildOrderConfirmationPlainText,
  buildOrderConfirmationSubject,
  type OrderConfirmationEmailInput,
  type OrderConfirmationLineItem,
} from "@/lib/email/order-confirmation-content";
import { getResendConfig } from "@/lib/email/resend-config";
import { resolveOrderLineProductName } from "@/lib/orders/order-line-display";
import { mergePaymentMeta, readPaymentMeta } from "@/lib/orders/payment-meta";
import db from "@/lib/supabase/db";
import {
  address,
  orderLines,
  orders,
  type SelectOrders,
} from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import { Resend } from "resend";

export type OrderConfirmationEmailResult = {
  sent: boolean;
  skipped?:
    | "not_configured"
    | "not_paid"
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

async function loadOrderConfirmationInput(
  order: SelectOrders,
): Promise<OrderConfirmationEmailInput | null> {
  const email = order.email?.trim();
  if (!email) return null;

  const orderRows = await db
    .select({
      addressLine1: address.line1,
      addressLine2: address.line2,
      addressCity: address.city,
      addressState: address.state,
      addressPostalCode: address.postal_code,
      addressCountry: address.country,
    })
    .from(orders)
    .leftJoin(address, eq(orders.addressId, address.id))
    .where(eq(orders.id, order.id))
    .limit(1);

  const addressRow = orderRows[0];
  const lineRows = await db
    .select({
      productNameSnapshot: orderLines.productNameSnapshot,
      quantity: orderLines.quantity,
      price: orderLines.price,
    })
    .from(orderLines)
    .where(eq(orderLines.orderId, order.id));

  const lineItems: OrderConfirmationLineItem[] = lineRows.map((row) => ({
    name: resolveOrderLineProductName(row),
    quantity: Number(row.quantity ?? 0),
    unitPrice: Number(row.price ?? 0),
  }));

  return {
    orderId: order.id,
    customerName: order.name,
    customerEmail: email,
    orderAmount: Number(order.amount),
    currency: order.currency,
    createdAt: order.createdAt,
    paymentMeta: order.payment_meta,
    lineItems,
    shippingAddress: addressRow
      ? {
          line1: addressRow.addressLine1,
          line2: addressRow.addressLine2,
          city: addressRow.addressCity,
          state: addressRow.addressState,
          postalCode: addressRow.addressPostalCode,
          country: addressRow.addressCountry,
        }
      : null,
    orderUrl: buildOrderUrl(order),
  };
}

export async function notifyOrderConfirmationEmail(
  order: SelectOrders,
): Promise<OrderConfirmationEmailResult> {
  const config = getResendConfig();
  if (!config) {
    return { sent: false, skipped: "not_configured" };
  }

  if (order.payment_status !== "paid") {
    return { sent: false, skipped: "not_paid" };
  }

  const meta = readPaymentMeta(order.payment_meta);
  if (meta.emailNotified === true) {
    return { sent: false, skipped: "already_notified" };
  }

  const input = await loadOrderConfirmationInput(order);
  if (!input) {
    return { sent: false, skipped: "no_email" };
  }

  const resend = new Resend(config.apiKey);

  try {
    const response = await resend.emails.send({
      from: config.fromEmail,
      to: input.customerEmail,
      subject: buildOrderConfirmationSubject(input.orderId),
      html: buildOrderConfirmationHtml(input),
      text: buildOrderConfirmationPlainText(input),
      replyTo: siteConfig.email,
    });

    if (response.error) {
      throw new Error(response.error.message || "Resend send failed");
    }

    await db
      .update(orders)
      .set({
        payment_meta: mergePaymentMeta(meta, {
          emailNotified: true,
          emailNotifiedAt: new Date().toISOString(),
          emailLastError: null,
        }),
      })
      .where(eq(orders.id, order.id));

    return { sent: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Order confirmation email failed";
    console.warn("[email] order confirmation failed:", message);

    await db
      .update(orders)
      .set({
        payment_meta: mergePaymentMeta(meta, {
          emailLastAttemptAt: new Date().toISOString(),
          emailLastError: message,
        }),
      })
      .where(eq(orders.id, order.id));

    return { sent: false, skipped: "error", error: message };
  }
}
