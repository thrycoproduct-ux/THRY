import { INTERNAL_ORDER_REF_BRAND } from "@/lib/orders/internal-order-ref";

export type AdminOrderSearchTerms = {
  /** ILIKE pattern against `orders.id`. */
  idPattern: string;
  /** ILIKE pattern against numeric `orders.internal_ref`, or null unless the query is a ref (digits, optional THRY). */
  refPattern: string | null;
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * Admin order search by order id or internal ref.
 * Accepts pasted display forms like `#abc123`, `Ref #THRY26090153`, `THRY-0153`.
 */
export function buildAdminOrderSearchTerms(
  query: string | null | undefined,
): AdminOrderSearchTerms | null {
  const cleaned = String(query ?? "")
    .trim()
    .replace(/^ref\b\s*/i, "")
    .replace(/^#\s*/, "")
    .trim();
  if (!cleaned) return null;

  const withoutBrand = cleaned.replace(
    new RegExp(`^${INTERNAL_ORDER_REF_BRAND}\\s*-?\\s*`, "i"),
    "",
  );
  const refDigits = withoutBrand.replace(/[\s-]/g, "");

  return {
    idPattern: `%${escapeLike(cleaned)}%`,
    refPattern: /^\d+$/.test(refDigits) ? `%${refDigits}%` : null,
  };
}
