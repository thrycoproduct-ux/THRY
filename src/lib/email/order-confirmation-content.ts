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
import {
  buildOrderPaymentBreakdown,
  type OrderPaymentBreakdownLine,
} from "@/lib/orders/order-payment-breakdown";
import { buildShippingAddressLines } from "@/lib/orders/shipping-address-text";
import { formatInr } from "@/lib/utils";

export type OrderConfirmationLineItem = OrderEmailLineItem;

export type OrderConfirmationEmailInput = {
  orderId: string;
  customerName: string | null;
  customerEmail: string;
  orderAmount: number;
  currency: string;
  createdAt: string | Date;
  paymentMeta: unknown;
  paymentMethod: string | null;
  customerPhone: string | null;
  lineItems: OrderConfirmationLineItem[];
  shippingAddress: OrderEmailShippingAddress | null;
  orderUrl: string;
};

export function formatBreakdownLineValue(
  line: OrderPaymentBreakdownLine,
): string {
  if (line.valueKind === "free") return "Free";
  if (line.valueKind === "not_applied") return "Not applied";
  return formatInr(line.amount);
}

export function buildOrderConfirmationSubject(orderId: string): string {
  return `Order confirmed — #${orderId} · ${siteConfig.name}`;
}

function buildBreakdownLines(input: OrderConfirmationEmailInput) {
  return buildOrderPaymentBreakdown({
    paymentMeta: input.paymentMeta,
    orderAmount: input.orderAmount,
    lineItems: input.lineItems.map((line) => ({
      unitPrice: line.unitPrice,
      quantity: line.quantity,
    })),
    includeGst: false,
  });
}

export function buildOrderConfirmationPlainText(
  input: OrderConfirmationEmailInput,
): string {
  const greeting = input.customerName?.trim() || "there";
  const placedAt = formatOrderDateTimeIst(input.createdAt);
  const breakdown = buildBreakdownLines(input);
  const summaryLines = breakdown.lines.map(
    (line) => `${line.label}: ${formatBreakdownLineValue(line)}`,
  );

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
    `Thanks for your order at ${siteConfig.name}!`,
    "",
    `Order #${input.orderId}`,
    `Placed: ${placedAt}`,
    input.paymentMethod ? `Payment: ${input.paymentMethod}` : null,
    input.customerPhone ? `Phone: ${input.customerPhone}` : null,
    "",
    "Items",
    ...buildLineItemsPlainText(input.lineItems),
    "",
    "Order summary",
    ...summaryLines,
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

export function buildOrderConfirmationHtml(
  input: OrderConfirmationEmailInput,
): string {
  const greeting = escapeHtml(input.customerName?.trim() || "there");
  const orderUrl = escapeHtml(input.orderUrl);
  const breakdown = buildBreakdownLines(input);

  const summaryRows = breakdown.lines
    .map((line) => {
      const label = escapeHtml(line.label);
      const value = escapeHtml(formatBreakdownLineValue(line));
      const weight = line.emphasize ? "font-weight:700;" : "";
      return `<tr>
        <td style="padding:6px 0;${weight}">${label}</td>
        <td style="padding:6px 0;text-align:right;${weight}">${value}</td>
      </tr>`;
    })
    .join("");

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
    <div style="font-size:14px;color:#555;margin-bottom:20px;">Order confirmed</div>
    <p style="margin:0 0 16px;">Hi ${greeting},</p>
    <p style="margin:0 0 16px;">Thanks for shopping with us. Your payment was received and your order is being prepared.</p>
    ${buildOrderMetaBlockHtml({
      orderId: input.orderId,
      placedAt: input.createdAt,
      paymentMethod: input.paymentMethod,
      customerPhone: input.customerPhone,
    })}
    <h2 style="font-size:16px;margin:0 0 8px;">Items</h2>
    ${buildLineItemsTableHtml(input.lineItems)}
    <h2 style="font-size:16px;margin:0 0 8px;">Order summary</h2>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
      ${summaryRows}
    </table>
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
    preheader: `Your THRY order #${input.orderId} is confirmed.`,
    bodyHtml,
  });
}
