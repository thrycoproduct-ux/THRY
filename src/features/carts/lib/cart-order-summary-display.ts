/** Cart price-summary display helpers (pure — easy to unit test). */

export function shouldShowCartDiscountRows(params: {
  discountAmount: number;
  promoPercentage?: number;
}): boolean {
  const discount = Number(params.discountAmount);
  if (Number.isFinite(discount) && discount > 0) return true;
  const pct = Number(params.promoPercentage ?? 0);
  return Number.isFinite(pct) && pct > 0;
}

/** Label for the GST row, e.g. "GST (18%)" when a rate is configured. */
export function formatCartGstLabel(params: {
  gstEnabled: boolean;
  gstPercentage: number;
}): string {
  if (!params.gstEnabled) return "GST";
  const pct = Number(params.gstPercentage);
  if (!Number.isFinite(pct) || pct <= 0) return "GST";
  const rounded = Math.round(pct * 100) / 100;
  const display =
    Number.isInteger(rounded) || Math.abs(rounded - Math.round(rounded)) < 1e-9
      ? String(Math.round(rounded))
      : String(rounded);
  return `GST (${display}%)`;
}
