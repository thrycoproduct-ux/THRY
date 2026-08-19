const MAX_TRACKING_LENGTH = 64;

/**
 * Sanitize & validate an optional courier tracking number.
 *
 * Rules:
 * - Trim and remove all whitespace.
 * - Allow only alphanumerics plus `- _ /`.
 * - Enforce max length.
 * - Return `null` when effectively empty.
 *
 * Throws on invalid (so callers can return a 400).
 */
export function sanitizeTrackingNumber(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;

  const normalized = raw.trim().replace(/\s+/g, "");
  if (!normalized) return null;

  // Normalize casing to reduce subtle duplicate-idempotency issues.
  const value = normalized.toUpperCase();

  const allowed = /^[A-Z0-9\-_/]+$/;
  if (!allowed.test(value)) {
    throw new Error(
      "Invalid tracking number. Allowed characters: A-Z, 0-9, '-', '_' and '/'.",
    );
  }

  if (value.length > MAX_TRACKING_LENGTH) {
    throw new Error(
      `Tracking number too long (max ${MAX_TRACKING_LENGTH} characters).`,
    );
  }

  return value;
}
