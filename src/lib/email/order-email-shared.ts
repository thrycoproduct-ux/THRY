import { siteConfig } from "@/config/site";
import { formatOrderDateTimeIst } from "@/lib/datetime/india";
import {
  resolveOrderLineImageAlt,
  resolveOrderLineImageKey,
  resolveOrderLineProductCode,
  resolveOrderLineProductName,
} from "@/lib/orders/order-line-display";
import type { SelectOrders } from "@/lib/supabase/schema";
import { formatInr, keytoUrl } from "@/lib/utils";

export type OrderEmailLineItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  imageUrl: string;
  imageAlt: string;
  productCode: string | null;
};

export type OrderEmailShippingAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function resolveOrderEmailImageUrl(key?: string | null): string {
  const raw = keytoUrl(key ?? undefined);
  if (raw.startsWith("/")) {
    return `${siteConfig.url.replace(/\/$/, "")}${raw}`;
  }
  return raw;
}

export function mapOrderLineRowToEmailItem(row: {
  productNameSnapshot?: string | null;
  productCodeSnapshot?: string | null;
  productImageKeySnapshot?: string | null;
  quantity: number | string | null;
  price: number | string | null;
  imageAlt?: string | null;
}): OrderEmailLineItem {
  const imageKey = resolveOrderLineImageKey(row);
  return {
    name: resolveOrderLineProductName(row),
    quantity: Number(row.quantity ?? 0),
    unitPrice: Number(row.price ?? 0),
    imageUrl: resolveOrderEmailImageUrl(imageKey),
    imageAlt: resolveOrderLineImageAlt(row),
    productCode: resolveOrderLineProductCode(row),
  };
}

export function formatOrderPaymentMethodLabel(
  order: Pick<SelectOrders, "payment_method" | "payment_provider">,
): string | null {
  const method = order.payment_method?.trim();
  const provider = order.payment_provider?.trim();
  if (provider && method) {
    return `${provider} · ${method}`;
  }
  return provider || method || null;
}

export function formatOrderPhoneLabel(
  mobile: string | null | undefined,
): string | null {
  const trimmed = mobile?.trim();
  return trimmed || null;
}

export function buildEmailBrandHeaderHtml(): string {
  const logoUrl = escapeHtml(
    `${siteConfig.url.replace(/\/$/, "")}/images/thry-wordmark.svg`,
  );
  const name = escapeHtml(siteConfig.name);
  return `<div style="margin-bottom:20px;">
    <img src="${logoUrl}" alt="${name}" width="120" height="32" style="display:block;height:32px;width:auto;max-width:140px;margin-bottom:8px;" />
  </div>`;
}

export function buildEmailFooterHtml(supportEmail = siteConfig.email): string {
  return `<p style="margin:24px 0 0;color:#555;font-size:13px;line-height:1.5;">
    Questions? Reply to this email or write to
    <a href="mailto:${escapeHtml(supportEmail)}" style="color:#111;">${escapeHtml(supportEmail)}</a>.
  </p>
  <p style="margin:8px 0 0;color:#888;font-size:12px;">${escapeHtml(siteConfig.url)}</p>`;
}

export function buildEmailLayoutHtml(params: {
  preheader: string;
  bodyHtml: string;
}): string {
  const preheader = escapeHtml(params.preheader);
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#111;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:8px;padding:24px;">
            <tr>
              <td>${params.bodyHtml}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildOrderMetaBlockHtml(params: {
  orderId: string;
  placedAt: string | Date;
  paymentMethod?: string | null;
  customerPhone?: string | null;
}): string {
  const lines = [
    `<strong>Order #${escapeHtml(params.orderId)}</strong>`,
    `<span style="color:#555;">Placed ${escapeHtml(formatOrderDateTimeIst(params.placedAt))}</span>`,
  ];
  if (params.paymentMethod) {
    lines.push(
      `<span style="color:#555;">Payment: ${escapeHtml(params.paymentMethod)}</span>`,
    );
  }
  if (params.customerPhone) {
    lines.push(
      `<span style="color:#555;">Phone: ${escapeHtml(params.customerPhone)}</span>`,
    );
  }
  return `<p style="margin:0 0 20px;line-height:1.6;">${lines.join("<br />")}</p>`;
}

export function buildLineItemsTableHtml(
  lineItems: OrderEmailLineItem[],
): string {
  const rows = lineItems
    .map((line) => {
      const name = escapeHtml(line.name);
      const code = line.productCode
        ? `<div style="color:#666;font-size:12px;margin-top:2px;">Code: ${escapeHtml(line.productCode)}</div>`
        : "";
      const qty = line.quantity;
      const unit = escapeHtml(formatInr(line.unitPrice));
      const total = escapeHtml(formatInr(line.unitPrice * line.quantity));
      const imageUrl = escapeHtml(line.imageUrl);
      const imageAlt = escapeHtml(line.imageAlt);
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;width:72px;vertical-align:top;">
          <img src="${imageUrl}" alt="${imageAlt}" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:6px;background:#f3f3f3;" />
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #eee;vertical-align:top;">
          <div style="font-weight:600;">${name}</div>
          ${code}
          <div style="color:#666;font-size:12px;margin-top:4px;">Qty ${qty} × ${unit}</div>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;vertical-align:top;white-space:nowrap;">${total}</td>
      </tr>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
    <tr>
      <th align="left" colspan="2" style="padding:8px 0;border-bottom:2px solid #111;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Product</th>
      <th align="right" style="padding:8px 0;border-bottom:2px solid #111;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Amount</th>
    </tr>
    ${rows}
  </table>`;
}

export function buildLineItemsPlainText(
  lineItems: OrderEmailLineItem[],
): string[] {
  return lineItems.map((line) => {
    const code = line.productCode ? ` (${line.productCode})` : "";
    const total = line.unitPrice * line.quantity;
    return `- ${line.name}${code} × ${line.quantity} — ${formatInr(total)}`;
  });
}
