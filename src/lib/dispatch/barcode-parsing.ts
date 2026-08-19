import { sanitizeTrackingNumber } from "./tracking-sanitizer";

/**
 * Parse a raw barcode/QR decoded string into an optional tracking number.
 *
 * Scanner UX sometimes yields extra text (e.g. "Tracking: ABC-123").
 * This helper extracts the first plausible token and then runs the same
 * strict tracking sanitizer used by the server.
 */
export function parseTrackingNumberFromBarcodeText(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Fast path: the whole string might already be clean.
  try {
    const sanitized = sanitizeTrackingNumber(trimmed);
    if (sanitized && /\d/.test(sanitized)) return sanitized;
    return null;
  } catch {
    // fall through to extraction
  }

  // Best-effort extraction: pull the first allowed token out of the input.
  // Note: sanitizer will do the final length/character validation.
  const matches = trimmed.match(/[A-Za-z0-9\-_/]+/g) ?? [];
  if (matches.length === 0) return null;

  // Prefer the first token containing at least one digit (tracking numbers
  // almost always contain digits; this avoids returning words like TRACKING).
  const withDigits = matches.find((m) => /\d/.test(m));
  if (!withDigits) return null;

  try {
    return sanitizeTrackingNumber(withDigits);
  } catch {
    return null;
  }
}
