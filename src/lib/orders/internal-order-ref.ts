/**
 * Paid-order internal reference: YYMM + 4-digit monthly sequence.
 * Example: September 2026, 1st paid order → DB `26090001`, display `THRY26090001`
 *
 * Assigned only when payment becomes paid (not at checkout create).
 */

export const INTERNAL_ORDER_REF_BRAND = "THRY";
export const INTERNAL_ORDER_REF_SEQ_DIGITS = 4;
export const INTERNAL_ORDER_REF_MAX_SEQ =
  10 ** INTERNAL_ORDER_REF_SEQ_DIGITS - 1; // 9999

/** IST calendar year/month for the prefix (shop timezone). */
export function internalOrderRefPrefixFromDate(now: Date = new Date()): {
  yymm: string;
  year: number;
  month: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === "year")?.value ?? NaN);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? NaN);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new Error("Could not resolve IST year/month for internal order ref");
  }

  const yy = String(year % 100).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return { yymm: `${yy}${mm}`, year, month };
}

export function formatInternalOrderRef(yymm: string, seq: number): string {
  const prefix = String(yymm ?? "")
    .trim()
    .replace(/\D/g, "");
  if (!/^\d{4}$/.test(prefix)) {
    throw new Error(`Invalid internal ref prefix: ${yymm}`);
  }
  if (!Number.isInteger(seq) || seq < 1 || seq > INTERNAL_ORDER_REF_MAX_SEQ) {
    throw new Error(
      `Internal ref sequence out of range (1–${INTERNAL_ORDER_REF_MAX_SEQ}): ${seq}`,
    );
  }
  return `${prefix}${String(seq).padStart(INTERNAL_ORDER_REF_SEQ_DIGITS, "0")}`;
}

/** Strip optional THRY brand for parsing stored or pasted refs. */
function stripInternalOrderRefBrand(value: string): string {
  return value
    .trim()
    .replace(new RegExp(`^${INTERNAL_ORDER_REF_BRAND}\\s*-?`, "i"), "");
}

/**
 * Human-facing internal ref with brand, e.g. `THRY26090001`.
 * DB keeps the numeric `26090001`; display always prefixes THRY.
 */
export function displayInternalOrderRef(
  value: string | null | undefined,
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const numeric = stripInternalOrderRefBrand(raw).replace(/\D/g, "");
  if (!/^\d{8}$/.test(numeric)) {
    const cleaned = stripInternalOrderRefBrand(raw);
    return cleaned
      ? `${INTERNAL_ORDER_REF_BRAND}${cleaned}`
      : `${INTERNAL_ORDER_REF_BRAND}${raw}`;
  }
  return `${INTERNAL_ORDER_REF_BRAND}${numeric}`;
}

export function parseInternalOrderRef(value: string | null | undefined): {
  yymm: string;
  seq: number;
} | null {
  const raw = stripInternalOrderRefBrand(String(value ?? ""));
  if (!/^\d{8}$/.test(raw)) return null;
  const yymm = raw.slice(0, 4);
  const seq = Number(raw.slice(4));
  if (!Number.isInteger(seq) || seq < 1) return null;
  return { yymm, seq };
}

export function isValidInternalOrderRef(
  value: string | null | undefined,
): boolean {
  return parseInternalOrderRef(value) != null;
}

/** Next sequence after the highest known seq for a yymm (tests / dry-run). */
export function nextInternalOrderSeq(lastSeq: number): number {
  const next = Math.max(0, Math.floor(lastSeq)) + 1;
  if (next > INTERNAL_ORDER_REF_MAX_SEQ) {
    throw new Error(
      `Internal order ref sequence exhausted for this month (max ${INTERNAL_ORDER_REF_MAX_SEQ})`,
    );
  }
  return next;
}
