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
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).replace(/_/g, " ");
}

/** Human-readable variant for admin lists, PDFs, and copy text. */
export function formatOrderLineVariant(input: {
  size?: string | null;
  selections?: Record<string, unknown> | null;
}): string | null {
  const selections: Record<string, string> = {};
  if (input.selections && typeof input.selections === "object") {
    for (const [key, value] of Object.entries(input.selections)) {
      const normalizedKey = String(key ?? "").trim();
      const normalizedValue = String(value ?? "").trim();
      if (normalizedKey && normalizedValue) {
        selections[normalizedKey] = normalizedValue;
      }
    }
  }

  if (Object.keys(selections).length > 0) {
    return Object.entries(selections)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${humanizeOptionKey(key)}: ${value}`)
      .join(" • ");
  }

  const sizeOnly = String(input.size ?? "").trim();
  return sizeOnly ? `Size: ${sizeOnly}` : null;
}
