/**
 * Value-stable key for a set of product ids. Use as an effect dependency
 * instead of a per-render array, which would re-run the effect every render.
 */
export function productIdsKey(ids: readonly string[]): string {
  return Array.from(new Set(ids.filter(Boolean)))
    .sort()
    .join(",");
}

export function productIdsFromKey(key: string): string[] {
  return key ? key.split(",") : [];
}
