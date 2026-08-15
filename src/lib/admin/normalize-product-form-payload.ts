import type { InsertProducts } from "@/lib/supabase/schema";
import { normalizeDiscountPercent } from "@/lib/products/discount";
import { resolveDigitalProductFields } from "@/lib/products/digital-product";

const BADGE_VALUES = new Set(["new_product", "best_sale", "featured"]);

/** Coerce blank / invalid form values into a safe numeric string for PG decimal. */
export function normalizeDecimalInput(
  raw: unknown,
  options: {
    fallback: string;
    fieldLabel: string;
    min?: number;
    max?: number;
    required?: boolean;
  },
): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    if (options.required) {
      throw new Error(`${options.fieldLabel} is required.`);
    }
    return options.fallback;
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    throw new Error(`Enter a valid ${options.fieldLabel.toLowerCase()}.`);
  }

  const min = options.min ?? Number.NEGATIVE_INFINITY;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  if (value < min || value > max) {
    throw new Error(`${options.fieldLabel} must be between ${min} and ${max}.`);
  }

  // Keep at most 2 decimal places for money-like fields; rating uses 1.
  const rounded =
    options.max != null && options.max <= 5
      ? Math.round(value * 10) / 10
      : Math.round(value * 100) / 100;

  return String(rounded);
}

export function normalizeProductFormPayload(
  data: InsertProducts,
  options?: { stockFallback?: number },
): InsertProducts {
  const stockParsed = Number(data.stock);
  const stock = Number.isFinite(stockParsed)
    ? Math.max(0, Math.round(stockParsed))
    : Math.max(0, Math.round(options?.stockFallback ?? 0));

  const badgeRaw = data.badge == null ? null : String(data.badge).trim();
  const badge =
    badgeRaw && BADGE_VALUES.has(badgeRaw)
      ? (badgeRaw as InsertProducts["badge"])
      : null;

  const description = String(data.description ?? "").trim();
  if (!description) {
    throw new Error("Description is required.");
  }

  const name = String(data.name ?? "").trim();
  if (!name) {
    throw new Error("Product name is required.");
  }

  const collectionId = String(data.collectionId ?? "").trim();
  if (!collectionId) {
    throw new Error("Catalog is required.");
  }

  const rating = normalizeDecimalInput(data.rating, {
    fallback: "4",
    fieldLabel: "Rating",
    min: 0,
    max: 5,
    required: false,
  });

  const price = normalizeDecimalInput(data.price, {
    fallback: "0",
    fieldLabel: "Price",
    min: 0,
    required: true,
  });

  const discountEnabled = Boolean(data.discountEnabled);
  const discountPercent = discountEnabled
    ? normalizeDiscountPercent(data.discountPercent)
    : null;

  if (discountEnabled && discountPercent === null) {
    throw new Error(
      "Discount percent must be between 1 and 99 when discount is enabled.",
    );
  }

  const soldAsPack = Boolean(data.soldAsPack) && !data.isDigital;
  let packSize: number | null = null;
  if (soldAsPack) {
    const raw = Number(data.packSize);
    if (
      !Number.isFinite(raw) ||
      !Number.isInteger(raw) ||
      raw < 2 ||
      raw > 9999
    ) {
      throw new Error(
        "Pieces per set must be a whole number between 2 and 9999 when sold as a set/pack.",
      );
    }
    packSize = raw;
  }

  const digital = resolveDigitalProductFields(data);

  return {
    ...data,
    name,
    slug: String(data.slug ?? "").trim(),
    description,
    rating,
    price,
    isDraft: Boolean(data.isDraft),
    featured: Boolean(data.featured),
    badge,
    stock,
    tags: [],
    collectionId,
    discountEnabled,
    discountPercent,
    soldAsPack,
    packSize,
    isDigital: digital.isDigital,
    digitalFileKey: digital.digitalFileKey,
    digitalFileName: digital.digitalFileName,
    digitalFileSize: digital.digitalFileSize,
    digitalContentType: digital.digitalContentType,
  };
}

export function productStorefrontVisibilitySummary(product: {
  featured?: boolean | null;
  isDraft?: boolean | null;
}) {
  const featured = Boolean(product.featured);
  const isDraft = Boolean(product.isDraft);

  if (isDraft) {
    return "Saved as draft — hidden from the website.";
  }
  if (featured) {
    return "Saved and live — shown in Featured on the homepage and /featured.";
  }
  return "Saved and live — visible in Shop and Collections.";
}
