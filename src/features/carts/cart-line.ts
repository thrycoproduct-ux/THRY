import type { OptionSelections } from "./useCartStore";

export const DEFAULT_CART_VARIANT_KEY = "default";
const CART_LINE_SEPARATOR = "::";

export type CartLineInput = {
  productId?: string;
  size?: string;
  selections?: OptionSelections;
};

export function normalizeCartOptionSelections(
  selections?: OptionSelections | null,
): OptionSelections {
  const normalized: OptionSelections = {};
  if (!selections || typeof selections !== "object") return normalized;
  for (const [key, value] of Object.entries(selections)) {
    const normalizedKey = String(key ?? "").trim();
    const normalizedValue = String(value ?? "")
      .trim()
      .toUpperCase();
    if (normalizedKey && normalizedValue) {
      normalized[normalizedKey] = normalizedValue;
    }
  }
  return normalized;
}

export function normalizeCartSize(size?: string | null): string | undefined {
  const normalized = String(size ?? "")
    .trim()
    .toUpperCase();
  return normalized || undefined;
}

export function buildCartVariantKey(input: CartLineInput): string {
  const selections = normalizeCartOptionSelections(input.selections);
  const entries = Object.entries(selections).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length > 0) {
    return entries.map(([key, value]) => `${key}=${value}`).join("|");
  }

  const size = normalizeCartSize(input.size);
  return size ? `size=${size}` : DEFAULT_CART_VARIANT_KEY;
}

export function buildCartLineKey(input: Required<Pick<CartLineInput, "productId">> &
  Pick<CartLineInput, "size" | "selections">): string {
  return `${input.productId}${CART_LINE_SEPARATOR}${buildCartVariantKey(input)}`;
}

export function extractProductIdFromCartLineKey(
  lineKey: string,
  fallbackProductId?: string | null,
): string {
  const fallback = String(fallbackProductId ?? "").trim();
  if (fallback) return fallback;
  const [productId] = String(lineKey ?? "").split(CART_LINE_SEPARATOR);
  return productId?.trim() ?? "";
}
