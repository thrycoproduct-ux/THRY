const TRACKING_TOKEN = "{tracking}";

/**
 * Build a courier tracking URL from a template and tracking number.
 *
 * Templates may include `{tracking}` (recommended). If the template has no
 * placeholder, the tracking number is appended as a final path segment.
 *
 * Returns null when the template is missing/invalid or tracking is required
 * but absent (callers can still show courier name without a link).
 */
export function buildCourierTrackingUrl(
  template: string | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  const normalizedTemplate = template?.trim();
  if (!normalizedTemplate) return null;

  const tracking = trackingNumber?.trim();
  if (!tracking) {
    // Portal-only URLs without a placeholder are not useful without tracking.
    if (!normalizedTemplate.includes(TRACKING_TOKEN)) return null;
    return null;
  }

  const encoded = encodeURIComponent(tracking);
  const urlStr = normalizedTemplate.includes(TRACKING_TOKEN)
    ? normalizedTemplate.split(TRACKING_TOKEN).join(encoded)
    : `${normalizedTemplate.replace(/\/+$/, "")}/${encoded}`;

  try {
    const url = new URL(urlStr);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Resolve a tracking URL using a stored template snapshot first, then an
 * optional live courier template fallback (for older dispatch rows).
 */
export function resolveCourierTrackingUrl(input: {
  trackingNumber: string | null | undefined;
  templateSnapshot?: string | null;
  templateFallback?: string | null;
}): string | null {
  const fromSnapshot = buildCourierTrackingUrl(
    input.templateSnapshot,
    input.trackingNumber,
  );
  if (fromSnapshot) return fromSnapshot;

  return buildCourierTrackingUrl(
    input.templateFallback,
    input.trackingNumber,
  );
}
