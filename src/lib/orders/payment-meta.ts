/**
 * Normalize payment_meta from DB/drivers.
 * Legacy rows may be JSON-string scalars (drizzle 0.29 + postgres.js).
 * New writes use jsonRecordNullable and store real JSON objects.
 */
import { unwrapJsonRecord } from "@/lib/supabase/json-column";

export function readPaymentMeta(value: unknown): Record<string, unknown> {
  return unwrapJsonRecord(value) ?? {};
}

export function mergePaymentMeta(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...readPaymentMeta(existing), ...patch };
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) => {
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
      return nested;
    }
    return Object.fromEntries(
      Object.entries(nested as Record<string, unknown>).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      ),
    );
  });
}

/** JSON-equality (key order ignored, undefined dropped) — matches what jsonb would store. */
export function isSamePaymentMeta(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  return stableJson(a) === stableJson(b);
}
