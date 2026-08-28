import "server-only";

import { CACHE_TAGS, STOREFRONT_REVALIDATE_SECONDS } from "@/lib/cache/constants";
import { withStorefrontCache } from "@/lib/cache/storefront-cache";
import { sanitizeDownloadFileName } from "@/lib/products/digital-product";
import {
  formatProductPackLabel,
  type ProductPackFields,
} from "@/lib/products/pack";
import { resolveProductPricing } from "@/lib/products/pricing";
import { withRetry } from "@/lib/resilience";
import db from "@/lib/supabase/db";
import { products } from "@/lib/supabase/schema";
import type { CartProductPricing } from "@/lib/storefront/cart-pricing";
import { inArray } from "drizzle-orm";

export type ProductStorefrontSnapshot = {
  pricing: CartProductPricing;
  packFields: ProductPackFields;
  isDigital: boolean;
  digitalFileName: string | null;
};

/** Pure mapper — exported for unit tests (no database). */
export function buildSnapshotRecord(
  rows: Array<{
    id: string;
    price: string;
    discountEnabled: boolean;
    discountPercent: number | null;
    soldAsPack: boolean;
    packSize: number | null;
    isDigital: boolean;
    digitalFileName: string | null;
  }>,
): Record<string, ProductStorefrontSnapshot> {
  const record: Record<string, ProductStorefrontSnapshot> = {};

  for (const row of rows) {
    const resolved = resolveProductPricing(row);
    const packFields: ProductPackFields = {
      soldAsPack: Boolean(row.soldAsPack),
      packSize: row.packSize ?? null,
    };
    const isDigital = Boolean(row.isDigital);
    const rawFileName = String(row.digitalFileName ?? "").trim();

    record[row.id] = {
      pricing: {
        productId: row.id,
        ...resolved,
        ...packFields,
        isDigital,
      },
      packFields,
      isDigital,
      digitalFileName:
        isDigital && rawFileName ? sanitizeDownloadFileName(rawFileName) : null,
    };
  }

  return record;
}

/**
 * Cached storefront read: price, discount, pack badge, and digital meta in one SELECT.
 * Display-only — checkout/cart still loads live pricing from the database.
 */
export async function getProductStorefrontSnapshotsByIds(
  productIds: string[],
): Promise<Map<string, ProductStorefrontSnapshot>> {
  const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))].sort();
  if (ids.length === 0) return new Map();

  const cacheKey = `sf:snapshot:batch:${ids.join(",")}`;
  const record = await withStorefrontCache(
    cacheKey,
    async () => {
      const rows = await withRetry(
        () =>
          db
            .select({
              id: products.id,
              price: products.price,
              discountEnabled: products.discountEnabled,
              discountPercent: products.discountPercent,
              soldAsPack: products.soldAsPack,
              packSize: products.packSize,
              isDigital: products.isDigital,
              digitalFileName: products.digitalFileName,
            })
            .from(products)
            .where(inArray(products.id, ids)),
        { label: "product-storefront-snapshot" },
      );

      return buildSnapshotRecord(rows);
    },
    { revalidate: STOREFRONT_REVALIDATE_SECONDS, tags: [CACHE_TAGS.products] },
  );

  return new Map(Object.entries(record));
}

export function formatPackLabelFromSnapshot(
  snapshot: ProductStorefrontSnapshot | undefined,
): string | null {
  return formatProductPackLabel(snapshot?.packFields);
}
