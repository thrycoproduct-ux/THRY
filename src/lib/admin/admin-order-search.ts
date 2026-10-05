import { INTERNAL_ORDER_REF_BRAND } from "@/lib/orders/internal-order-ref";

export type AdminOrderSearchTerms = {
  /** ILIKE pattern against `orders.id`. */
  idPattern: string;
  /** ILIKE pattern against numeric `orders.internal_ref`, or null unless the query is a ref (digits, optional THRY). */
  refPattern: string | null;
  /** ILIKE pattern against `orders.name`, or null unless the query contains a letter. */
  namePattern: string | null;
  /** LIKE pattern against 10-digit `orders.customer_mobile`, or null unless the query is a phone fragment (4+ digits). */
  mobilePattern: string | null;
};

const MIN_MOBILE_DIGITS = 4;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function toMobileDigits(value: string): string | null {
  if (!/^[\d\s()+-]+$/.test(value)) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0"))
    digits = digits.slice(1);
  return digits.length >= MIN_MOBILE_DIGITS ? digits : null;
}

/**
 * Admin order search by order id, internal ref, customer name or mobile.
 * Accepts pasted display forms like `#abc123`, `Ref #THRY26090153`, `THRY-0153`,
 * `+91 98765 43210`.
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
  const isRef = /^\d+$/.test(refDigits);
  const isBrandedRef = isRef && withoutBrand !== cleaned;
  const mobileDigits = isBrandedRef ? null : toMobileDigits(cleaned);
  const name = cleaned.replace(/\s+/g, " ");

  return {
    idPattern: `%${escapeLike(cleaned)}%`,
    refPattern: isRef ? `%${refDigits}%` : null,
    namePattern:
      !isBrandedRef && /\p{L}/u.test(name) ? `%${escapeLike(name)}%` : null,
    mobilePattern: mobileDigits ? `%${mobileDigits}%` : null,
  };
}
