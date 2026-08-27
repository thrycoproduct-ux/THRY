export type OrderLineDisplayFields = {
  productName?: string | null;
  productSlug?: string | null;
  productCode?: string | null;
  imageKey?: string | null;
  imageAlt?: string | null;
  productNameSnapshot?: string | null;
  productSlugSnapshot?: string | null;
  productCodeSnapshot?: string | null;
  productImageKeySnapshot?: string | null;
};

export function resolveOrderLineProductName(
  row: OrderLineDisplayFields,
): string {
  return (
    String(row.productName ?? row.productNameSnapshot ?? "").trim() || "Product"
  );
}

export function resolveOrderLineProductSlug(
  row: OrderLineDisplayFields,
): string | null {
  const slug = String(row.productSlug ?? row.productSlugSnapshot ?? "").trim();
  return slug || null;
}

export function resolveOrderLineProductCode(
  row: OrderLineDisplayFields,
): string | null {
  const code = String(row.productCode ?? row.productCodeSnapshot ?? "").trim();
  return code || null;
}

export function resolveOrderLineImageKey(
  row: OrderLineDisplayFields,
): string | null {
  const key = String(row.imageKey ?? row.productImageKeySnapshot ?? "").trim();
  return key || null;
}

export function resolveOrderLineImageAlt(row: OrderLineDisplayFields): string {
  return (
    String(row.imageAlt ?? "").trim() ||
    resolveOrderLineProductName(row) ||
    "Product image"
  );
}

function humanizeOptionKey(key: string): string {
  const trimmed = String(key ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase() === "size") return "Size";
  if (/^group[_-]/i.test(trimmed) || trimmed.toLowerCase() === "legacy") {
    return "Size";
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).replace(/_/g, " ");
}

function optionLabel(
  key: string,
  groupNames?: Record<string, string> | null,
): string {
  const named = String(groupNames?.[key] ?? "").trim();
  return named || humanizeOptionKey(key) || "Size";
}

/** Human-readable variant for admin lists, PDFs, and copy text. */
export function formatOrderLineVariant(input: {
  size?: string | null;
  selections?: Record<string, unknown> | null;
  groupNames?: Record<string, string> | null;
}): string | null {
  const pairs: Array<{ label: string; value: string }> = [];
  const seenValues = new Set<string>();

  if (input.selections && typeof input.selections === "object") {
    for (const [key, value] of Object.entries(input.selections)) {
      const normalizedKey = String(key ?? "").trim();
      const normalizedValue = String(value ?? "").trim();
      if (!normalizedKey || !normalizedValue) continue;
      const label = optionLabel(normalizedKey, input.groupNames);
      const dedupe = `${label.toLowerCase()}:${normalizedValue.toLowerCase()}`;
      if (seenValues.has(dedupe)) continue;
      seenValues.add(dedupe);
      pairs.push({ label, value: normalizedValue });
    }
  }

  if (pairs.length > 0) {
    return pairs
      .sort((left, right) => left.label.localeCompare(right.label))
      .map(({ label, value }) => `${label}: ${value}`)
      .join(" • ");
  }

  const sizeOnly = String(input.size ?? "").trim();
  return sizeOnly ? `Size: ${sizeOnly}` : null;
}
