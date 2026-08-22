import { siteConfig } from "@/config/site";
import { formatOrderDateTimeIst } from "@/lib/datetime/india";
import {
  buildOrderPaymentBreakdown,
  type OrderPaymentBreakdownLine,
} from "@/lib/orders/order-payment-breakdown";
import { buildShippingAddressLines } from "@/lib/orders/shipping-address-text";
import { formatInr } from "@/lib/utils";

export type OrderConfirmationLineItem = {
  name: string;
  quantity: number;
  unitPrice: number;
};

export type OrderConfirmationEmailInput = {
  orderId: string;
  customerName: string | null;
  customerEmail: string;
  orderAmount: number;
  currency: string;
  createdAt: string | Date;
  paymentMeta: unknown;
  lineItems: OrderConfirmationLineItem[];
  shippingAddress: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
  orderUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatBreakdownLineValue(line: OrderPaymentBreakdownLine): string {
  if (line.valueKind === "free") return "Free";
  if (line.valueKind === "not_applied") return "Not applied";
  return formatInr(line.amount);
}

export function buildOrderConfirmationSubject(orderId: string): string {
  return `Order confirmed — #${orderId} · ${siteConfig.name}`;
}

export function buildOrderConfirmationPlainText(
  input: OrderConfirmationEmailInput,
): string {
  const greeting = input.customerName?.trim() || "there";
  const placedAt = formatOrderDateTimeIst(input.createdAt);
  const breakdown = buildOrderPaymentBreakdown({
    paymentMeta: input.paymentMeta,
    orderAmount: input.orderAmount,
    lineItems: input.lineItems.map((line) => ({
      unitPrice: line.unitPrice,
      quantity: line.quantity,
    })),
  });

  const itemLines = input.lineItems.map((line) => {
    const lineTotal = line.unitPrice * line.quantity;
    return `- ${line.name} × ${line.quantity} — ${formatInr(lineTotal)}`;
  });

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
    "",
    "Items",
    ...itemLines,
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
  const placedAt = escapeHtml(formatOrderDateTimeIst(input.createdAt));
  const orderId = escapeHtml(input.orderId);
  const orderUrl = escapeHtml(input.orderUrl);
  const supportEmail = escapeHtml(siteConfig.email);

  const breakdown = buildOrderPaymentBreakdown({
    paymentMeta: input.paymentMeta,
    orderAmount: input.orderAmount,
    lineItems: input.lineItems.map((line) => ({
      unitPrice: line.unitPrice,
      quantity: line.quantity,
    })),
  });

  const itemRows = input.lineItems
    .map((line) => {
      const name = escapeHtml(line.name);
      const qty = line.quantity;
      const total = escapeHtml(formatInr(line.unitPrice * line.quantity));
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">${name}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;">${qty}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${total}</td>
      </tr>`;
    })
    .join("");

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

  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:24px;">
            <tr>
              <td>
                <div style="font-size:20px;font-weight:700;margin-bottom:4px;">${escapeHtml(siteConfig.name)}</div>
                <div style="font-size:14px;color:#555;margin-bottom:20px;">Order confirmed</div>
                <p style="margin:0 0 16px;">Hi ${greeting},</p>
                <p style="margin:0 0 16px;">Thanks for shopping with us. Your payment was received and your order is being prepared.</p>
                <p style="margin:0 0 20px;">
                  <strong>Order #${orderId}</strong><br />
                  <span style="color:#555;">Placed ${placedAt}</span>
                </p>
                <h2 style="font-size:16px;margin:0 0 8px;">Items</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
                  <tr>
                    <th align="left" style="padding:8px 0;border-bottom:2px solid #111;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Product</th>
                    <th style="padding:8px 0;border-bottom:2px solid #111;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Qty</th>
                    <th align="right" style="padding:8px 0;border-bottom:2px solid #111;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Amount</th>
                  </tr>
                  ${itemRows}
                </table>
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
                <p style="margin:0;color:#555;font-size:13px;line-height:1.5;">
                  Questions? Reply to this email or write to
                  <a href="mailto:${supportEmail}" style="color:#111;">${supportEmail}</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
