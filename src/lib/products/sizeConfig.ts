import { CACHE_TAGS } from "@/lib/cache/constants";
import { invalidateStorefrontCache } from "@/lib/cache/invalidate-storefront";
import { withStorefrontCache } from "@/lib/cache/storefront-cache";
import db from "@/lib/supabase/db";
import { apiSettings } from "@/lib/supabase/schema";
import { eq, inArray } from "drizzle-orm";
import { withFallback } from "@/lib/resilience";
import {
  EMPTY_PRODUCT_SIZE_PREVIEW,
  normalizeProductSizeConfig,
  serializeProductSizeConfig,
  toProductSizePreview,
  type ProductSizeConfig,
  type ProductSizePreview,
} from "./sizeConfig-shared";
import { registerVariantTypeNames } from "./variant-type-catalog";

export * from "./sizeConfig-shared";

const KEY_PREFIX = "product_size_";

export function getProductSizeConfigKey(productId: string) {
  return `${KEY_PREFIX}${productId}`;
}

async function loadProductSizeConfig(
  productId: string,
): Promise<ProductSizeConfig> {
  const key = getProductSizeConfigKey(productId);
  const row = await db.query.apiSettings.findFirst({
    where: eq(apiSettings.key, key),
  });
  return normalizeProductSizeConfig(row?.value);
}

export async function getProductSizeConfig(
  productId: string,
): Promise<ProductSizeConfig> {
  return withStorefrontCache(
    `sf:size:${productId}`,
    () => loadProductSizeConfig(productId),
    { tags: [CACHE_TAGS.sizeConfig] },
  );
}

async function loadProductSizeConfigsByProductIds(productIds: string[]) {
  const unique = [...new Set(productIds.filter(Boolean))];
  if (unique.length === 0) return new Map<string, ProductSizeConfig>();

  const keys = unique.map(getProductSizeConfigKey);
  const rows = await db
    .select({ key: apiSettings.key, value: apiSettings.value })
    .from(apiSettings)
    .where(inArray(apiSettings.key, keys));

  const map = new Map<string, ProductSizeConfig>();
  rows.forEach((row) => {
    const id = row.key.replace(KEY_PREFIX, "");
    map.set(id, normalizeProductSizeConfig(row.value));
  });
  return map;
}

export async function getProductSizeConfigsByProductIds(productIds: string[]) {
  const unique = [...new Set(productIds.filter(Boolean))].sort();
  if (unique.length === 0) return new Map<string, ProductSizeConfig>();

  const serialized = await withStorefrontCache(
    `sf:size:batch:${unique.join(",")}`,
    async () => {
      const map = await loadProductSizeConfigsByProductIds(unique);
      return Object.fromEntries(map.entries());
    },
    { tags: [CACHE_TAGS.sizeConfig] },
  );

  return new Map(Object.entries(serialized));
}

/**
 * Batch listing size previews by product id.
 * Presentation-only: DB blips return empty previews rather than failing the PLP.
 */
export async function getProductSizePreviewsByIds(
  productIds: string[],
): Promise<Record<string, ProductSizePreview>> {
  const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return {};

  const configs = await withFallback(
    "size-previews",
    () => getProductSizeConfigsByProductIds(ids),
    new Map<string, ProductSizeConfig>(),
    { attempts: 1 },
  );

  const previews: Record<string, ProductSizePreview> = {};
  for (const id of ids) {
    const config = configs.get(id);
    previews[id] = config
      ? toProductSizePreview(config)
      : { ...EMPTY_PRODUCT_SIZE_PREVIEW };
  }
  return previews;
}

export async function upsertProductSizeConfig(params: {
  productId: string;
  config: ProductSizeConfig;
  updatedBy?: string | null;
}) {
  const key = getProductSizeConfigKey(params.productId);
  const normalized = normalizeProductSizeConfig(params.config);
  const value = serializeProductSizeConfig(normalized);
  await db
    .insert(apiSettings)
    .values({
      key,
      value,
      isEnabled: normalized.enabled,
      updatedBy: params.updatedBy ?? null,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: apiSettings.key,
      set: {
        value,
        isEnabled: normalized.enabled,
        updatedBy: params.updatedBy ?? null,
        updatedAt: new Date().toISOString(),
      },
    });

  if (normalized.enabled) {
    const groupNames = normalized.groups
      .map((group) => group.name)
      .filter(Boolean);
    try {
      await registerVariantTypeNames(groupNames, params.updatedBy);
    } catch (error) {
      console.error("[sizeConfig] registerVariantTypeNames failed:", error);
    }
  }

  await invalidateStorefrontCache();
}
