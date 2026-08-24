import {
  formatCartGstLabel,
  shouldShowCartDiscountRows,
} from "@/features/carts/lib/cart-order-summary-display";
import { readPaymentMeta } from "@/lib/orders/payment-meta";

export type OrderPaymentBreakdownLine = {
  key:
    | "subtotal"
    | "discount"
    | "discountedSubtotal"
    | "courier"
    | "gst"
    | "total";
  label: string;
  /** Display value already formatted for Free / Not applied cases when needed. */
  valueKind: "money" | "free" | "not_applied";
  amount: number;
  emphasize?: boolean;
};

export type OrderPaymentBreakdown = {
  total: number;
  lines: OrderPaymentBreakdownLine[];
  hasPricingMeta: boolean;
};

function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function asNonNegative(value: unknown): number | null {
  const n = asFiniteNumber(value);
  if (n === null || n < 0) return null;
  return n;
}

/**
 * Build cart-like admin/customer order money rows from checkout payment_meta.
 * Total is always `orderAmount` — never invented from incomplete parts.
 */
export function buildOrderPaymentBreakdown(params: {
  paymentMeta: unknown;
  orderAmount: number;
  lineItems?: Array<{ unitPrice: number; quantity: number }>;
}): OrderPaymentBreakdown {
  const meta = readPaymentMeta(params.paymentMeta);
  const total = Math.max(0, asFiniteNumber(params.orderAmount) ?? 0);

  const subtotalFromMeta = asNonNegative(meta.subtotalAmount);
  const lineSubtotal =
    params.lineItems?.reduce((sum, line) => {
      const unit = asNonNegative(line.unitPrice) ?? 0;
      const qty = asNonNegative(line.quantity) ?? 0;
      return sum + unit * qty;
    }, 0) ?? null;

  const subtotal = subtotalFromMeta ?? lineSubtotal;
  const discountAmount = asNonNegative(meta.discountAmount) ?? 0;
  const discountPercentage =
    asNonNegative(meta.discountPercentage) ??
    asNonNegative(meta.promoPercentage) ??
    0;
  const discountedSubtotal = asNonNegative(meta.discountedSubtotal);
  const courierCharge = asNonNegative(meta.courierCharge);
  const courierRule =
    typeof meta.courierRule === "string" ? meta.courierRule : null;
  const gstAmount = asNonNegative(meta.gstAmount);
  const gstEnabled = meta.gstEnabled === true;
  const gstPercentage = asNonNegative(meta.gstPercentage) ?? 0;
  const promoCode =
    typeof meta.promoCode === "string" && meta.promoCode.trim()
      ? meta.promoCode.trim()
      : null;

  const hasPricingMeta =
    subtotalFromMeta !== null ||
    courierCharge !== null ||
    gstAmount !== null ||
    discountAmount > 0 ||
    discountPercentage > 0;

  const lines: OrderPaymentBreakdownLine[] = [];

  if (subtotal !== null) {
    lines.push({
      key: "subtotal",
      label: "Subtotal",
      valueKind: "money",
      amount: subtotal,
    });
  }

  const showDiscount = shouldShowCartDiscountRows({
    discountAmount,
    promoPercentage: discountPercentage,
  });

  if (showDiscount) {
    const pctLabel = discountPercentage > 0 ? ` (${discountPercentage}%)` : "";
    const promoLabel = promoCode ? ` · ${promoCode}` : "";
    lines.push({
      key: "discount",
      label: `Discount${pctLabel}${promoLabel}`,
      valueKind: "money",
      amount: Math.abs(discountAmount),
    });
    if (discountedSubtotal !== null) {
      lines.push({
        key: "discountedSubtotal",
        label: "Subtotal after discount",
        valueKind: "money",
        amount: discountedSubtotal,
      });
    }
  }

  if (courierCharge !== null || courierRule === "free_shipping") {
    const isFree =
      courierRule === "free_shipping" ||
      (courierCharge !== null && courierCharge === 0 && courierRule !== null);
    lines.push({
      key: "courier",
      label: "Courier",
      valueKind: isFree ? "free" : "money",
      amount: courierCharge ?? 0,
    });
  }

  if (gstAmount !== null || gstEnabled) {
    lines.push({
      key: "gst",
      label: formatCartGstLabel({ gstEnabled, gstPercentage }),
      valueKind: gstEnabled || (gstAmount ?? 0) > 0 ? "money" : "not_applied",
      amount: gstAmount ?? 0,
    });
  }

  lines.push({
    key: "total",
    label: "Total",
    valueKind: "money",
    amount: total,
    emphasize: true,
  });

  return { total, lines, hasPricingMeta };
}
