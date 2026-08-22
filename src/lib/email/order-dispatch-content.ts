import { siteConfig } from "@/config/site";
import { formatOrderDateTimeIst } from "@/lib/datetime/india";
import {
  buildEmailBrandHeaderHtml,
  buildEmailFooterHtml,
  buildEmailLayoutHtml,
  buildLineItemsPlainText,
  buildLineItemsTableHtml,
  buildOrderMetaBlockHtml,
  escapeHtml,
  type OrderEmailLineItem,
  type OrderEmailShippingAddress,
} from "@/lib/email/order-email-shared";
import { buildShippingAddressLines } from "@/lib/orders/shipping-address-text";

export type OrderDispatchEmailInput = {
  orderId: string;
  customerName: string | null;
  customerEmail: string;
  createdAt: string | Date;
  customerPhone: string | null;
  lineItems: OrderEmailLineItem[];
  shippingAddress: OrderEmailShippingAddress | null;
  orderUrl: string;
  courierName: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  dispatchedAt: string;
};

export function buildOrderDispatchSubject(orderId: string): string {
  return `Your order has shipped — #${orderId} · ${siteConfig.name}`;
}

export function buildOrderDispatchPlainText(
  input: OrderDispatchEmailInput,
): string {
  const greeting = input.customerName?.trim() || "there";
  const addressLines = buildShippingAddressLines(
    input.shippingAddress
      ? {
          line1: input.shippingAddress.line1,
          line2: input.shippingAddress.line2,
          city: input.shippingAddress.city,
          state: input.shippingAddress.state,
          postalCode: input.shippingAddress.postalCode,
          country: input.shippingAddress.country,
        }
      : null,
  );

  return [
    `Hi ${greeting},`,
    "",
    `Good news — your THRY order has been dispatched.`,
    "",
    `Order #${input.orderId}`,
    `Dispatched: ${formatOrderDateTimeIst(input.dispatchedAt)}`,
    `Courier: ${input.courierName}`,
    input.trackingNumber ? `Tracking number: ${input.trackingNumber}` : null,
    input.trackingUrl ? `Track package: ${input.trackingUrl}` : null,
    input.customerPhone ? `Phone: ${input.customerPhone}` : null,
    "",
    "Items in this order",
    ...buildLineItemsPlainText(input.lineItems),
    "",
    "Shipping address",
    ...addressLines,
    input.shippingAddress?.postalCode?.trim()
      ? `PIN: ${input.shippingAddress.postalCode.trim()}`
      : null,
    "",
    `View your order: ${input.orderUrl}`,
    "",
    `Questions? Reply to this email or contact us at ${siteConfig.email}.`,
    "",
    siteConfig.url,
  ]
    .filter((line): line is string => line != null && line !== "")
    .join("\n");
}

export function buildOrderDispatchHtml(input: OrderDispatchEmailInput): string {
  const greeting = escapeHtml(input.customerName?.trim() || "there");
  const orderUrl = escapeHtml(input.orderUrl);
  const courierName = escapeHtml(input.courierName);
  const dispatchedAt = escapeHtml(formatOrderDateTimeIst(input.dispatchedAt));

  const trackingBlock = [
    input.trackingNumber
      ? `<div><strong>Tracking number:</strong> ${escapeHtml(input.trackingNumber)}</div>`
      : "",
    input.trackingUrl
      ? `<p style="margin:16px 0 0;">
          <a href="${escapeHtml(input.trackingUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600;">Track package</a>
        </p>`
      : "",
  ].join("");

  const addressLines = buildShippingAddressLines(
    input.shippingAddress
      ? {
          line1: input.shippingAddress.line1,
          line2: input.shippingAddress.line2,
          city: input.shippingAddress.city,
          state: input.shippingAddress.state,
          postalCode: input.shippingAddress.postalCode,
          country: input.shippingAddress.country,
        }
      : null,
  )
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");

  const pinLine = input.shippingAddress?.postalCode?.trim()
    ? `<div>PIN: ${escapeHtml(input.shippingAddress.postalCode.trim())}</div>`
    : "";

  const bodyHtml = `
    ${buildEmailBrandHeaderHtml()}
    <div style="font-size:14px;color:#555;margin-bottom:20px;">Order dispatched</div>
    <p style="margin:0 0 16px;">Hi ${greeting},</p>
    <p style="margin:0 0 16px;">Your order is on its way. We have handed it over to the courier below.</p>
    ${buildOrderMetaBlockHtml({
      orderId: input.orderId,
      placedAt: input.createdAt,
      customerPhone: input.customerPhone,
    })}
    <div style="margin:0 0 20px;padding:16px;background:#f8f8f8;border-radius:8px;line-height:1.6;">
      <div><strong>Courier:</strong> ${courierName}</div>
      <div><strong>Dispatched:</strong> ${dispatchedAt}</div>
      ${trackingBlock}
    </div>
    <h2 style="font-size:16px;margin:0 0 8px;">Items in this order</h2>
    ${buildLineItemsTableHtml(input.lineItems)}
    <h2 style="font-size:16px;margin:0 0 8px;">Shipping address</h2>
    <div style="margin-bottom:20px;color:#333;line-height:1.5;">
      ${addressLines}
      ${pinLine}
    </div>
    <p style="margin:0 0 24px;">
      <a href="${orderUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600;">View order</a>
    </p>
    ${buildEmailFooterHtml()}
  `;

  return buildEmailLayoutHtml({
    preheader: `Your THRY order #${input.orderId} has been dispatched.`,
    bodyHtml,
  });
}
