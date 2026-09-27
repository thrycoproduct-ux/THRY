import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { inArray } from "drizzle-orm";
import { ADMIN_PRODUCTS_LIST_TAG } from "@/lib/admin/getAdminProductsList";
import {
  isCatalogD1Enabled,
  syncCatalogMirror,
  triggerCatalogMirrorSync,
} from "@/lib/catalog/d1-mirror";
import db from "@/lib/supabase/db";
import { products } from "@/lib/supabase/schema";
import {
  CACHE_TAGS,
  productDetailCacheTag,
  productSizeCacheTag,
} from "./constants";
import { redisDelByPrefix } from "./redis";
import {
  clearStorefrontCacheEntries,
  clearStorefrontMemoryCache,
} from "./storefront-cache";

const REDIS_PREFIXES = [
  "sf:products:",
  "sf:drafts",
  "sf:size:",
  "sf:collection:",
  "sf:product:",
  "sf:published:",
  "sf:runtime-bundle",
  "sf:home-banner",
  "sf:landing",
  "sf:recommendations:",
  "sf:shop-by-price",
  "sf:pincode:",
  "sf:snapshot:",
  "sf:sitemap:",
] as const;

/** Narrow prefixes for category create/update/delete (avoids full KEYS scans). */
const COLLECTION_REDIS_PREFIXES = [
  "sf:collection:",
  "sf:landing",
  "sf:products:",
] as const;

/** Shared caches that list several products; any product change can alter them. */
const PRODUCT_LIST_PREFIXES = [
  "sf:products:",
  "sf:drafts",
  "sf:collection:",
  "sf:collections:",
  "sf:landing",
  "sf:recommendations:",
  "sf:shop-by-price",
  "sf:snapshot:",
  "sf:sitemap:products",
] as const;

const SIZE_BATCH_PREFIX = "sf:size:batch:";

async function clearRedisPrefixes(prefixes: readonly string[]) {
  await Promise.all(prefixes.map((prefix) => redisDelByPrefix(prefix)));
}

/** Bust admin products table cache after catalog writes. */
export function invalidateAdminProductsCache() {
  revalidateTag(ADMIN_PRODUCTS_LIST_TAG);
  // Admin products load live from DB; tag kept for future ISR if reintroduced.
}

/** Bust storefront read caches after admin/catalog writes. */
export async function invalidateStorefrontCache() {
  try {
    invalidateAdminProductsCache();
  } catch (error) {
    console.warn("[cache] admin tag revalidate failed:", error);
  }

  try {
    Object.values(CACHE_TAGS).forEach((tag) => revalidateTag(tag));
  } catch (error) {
    console.warn("[cache] storefront tag revalidate failed:", error);
  }

  try {
    await clearRedisPrefixes(REDIS_PREFIXES);
  } catch (error) {
    console.warn("[cache] redis prefix clear failed:", error);
  }

  try {
    clearStorefrontMemoryCache("sf:");
  } catch (error) {
    console.warn("[cache] memory clear failed:", error);
  }

  // Best-effort Supabase→D1 catalog mirror (no-op until CATALOG_WORKER_URL is set)
  triggerCatalogMirrorSync();
}

export type ProductCacheIdentity = {
  id: string;
  slug: string;
  featured: boolean | null;
};

/**
 * Loads the cache-relevant identity of products. Call before an update or
 * delete so the old slug and featured flag are cleared too.
 */
export async function loadProductCacheIdentities(
  productIds: readonly string[],
): Promise<ProductCacheIdentity[]> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return [];
  return db
    .select({
      id: products.id,
      slug: products.slug,
      featured: products.featured,
    })
    .from(products)
    .where(inArray(products.id, ids));
}

/**
 * Clears caches for specific products only: their detail pages and size
 * config, plus the shared product lists when `lists` is true. Other product
 * pages, settings and banners stay cached.
 *
 * Product pages embed featured recommendations, so when an affected product
 * is (or was) featured every product page is cleared.
 */
export async function invalidateProductCaches(params: {
  productIds: readonly string[];
  /** Identities loaded before the write (old slug / featured flag). */
  previous?: readonly ProductCacheIdentity[];
  lists?: boolean;
}): Promise<void> {
  const lists = params.lists ?? true;

  let current: ProductCacheIdentity[] = [];
  try {
    current = await loadProductCacheIdentities(params.productIds);
  } catch (error) {
    console.warn("[cache] product identity lookup failed; full bust:", error);
    await invalidateStorefrontCache();
    return;
  }

  const identities = [...(params.previous ?? []), ...current];
  const ids = [
    ...new Set([...params.productIds, ...identities.map((row) => row.id)]),
  ].filter(Boolean);
  const slugs = [...new Set(identities.map((row) => row.slug))].filter(Boolean);
  const touchesFeatured = identities.some((row) => row.featured === true);

  const keys = [
    ...slugs.flatMap((slug) => [`sf:product:${slug}`, `sf:published:${slug}`]),
    ...ids.map((id) => `sf:size:${id}`),
  ];
  const prefixes: string[] = [SIZE_BATCH_PREFIX];
  if (lists) prefixes.push(...PRODUCT_LIST_PREFIXES);
  if (touchesFeatured) prefixes.push("sf:product:");

  try {
    invalidateAdminProductsCache();
  } catch (error) {
    console.warn("[cache] admin tag revalidate failed:", error);
  }

  try {
    slugs.forEach((slug) => revalidateTag(productDetailCacheTag(slug)));
    ids.forEach((id) => revalidateTag(productSizeCacheTag(id)));
    revalidateTag(CACHE_TAGS.sizeBatch);
    if (lists) {
      revalidateTag(CACHE_TAGS.products);
      revalidateTag(CACHE_TAGS.drafts);
      revalidateTag(CACHE_TAGS.collections);
    }
    if (touchesFeatured) revalidateTag(CACHE_TAGS.productDetails);
  } catch (error) {
    console.warn("[cache] product tag revalidate failed:", error);
  }

  try {
    if (touchesFeatured) {
      revalidatePath("/shop/[slug]", "page");
    } else {
      slugs.forEach((slug) => revalidatePath(`/shop/${slug}`));
    }
  } catch (error) {
    console.warn("[cache] product path revalidate failed:", error);
  }

  const clear = async () => {
    try {
      await clearStorefrontCacheEntries({ keys, prefixes });
    } catch (error) {
      console.warn("[cache] product cache clear failed:", error);
    }
  };

  await clear();

  if (!lists) return;
  if (!isCatalogD1Enabled()) {
    triggerCatalogMirrorSync();
    return;
  }
  runInBackground(syncMirrorThenClear(clear));
}

/** Time for an already-running mirror sync to finish its queued re-run. */
const QUEUED_SYNC_WAIT_MS = 15_000;

/**
 * Storefront reads come from the D1 mirror, so a read between the first clear
 * and the sync finishing re-caches the old row. Clear again once D1 has it.
 */
async function syncMirrorThenClear(clear: () => Promise<void>) {
  const result = await syncCatalogMirror();
  if (result.ok === false) {
    console.warn("[catalog-d1] sync failed:", result.error);
  }
  const settled =
    result.ok &&
    !result.skipped &&
    !(result.data as { queued?: boolean } | undefined)?.queued;
  if (!settled) {
    await new Promise((resolve) => setTimeout(resolve, QUEUED_SYNC_WAIT_MS));
  }
  await clear();
}

/** Keeps post-response work alive; outside a request scope it runs fire-and-forget. */
function runInBackground(task: Promise<void>) {
  const guarded = task.catch((error) => {
    console.warn("[cache] background invalidation failed:", error);
  });
  try {
    after(() => guarded);
  } catch {
    void guarded;
  }
}

/**
 * Category-only catalog changes: fewer Redis KEYS scans + less Fluid Active CPU
 * than a full storefront bust.
 */
export async function invalidateStorefrontCollectionsCache() {
  try {
    revalidateTag(CACHE_TAGS.collections);
    revalidateTag(CACHE_TAGS.products);
    revalidateTag(CACHE_TAGS.productDetails);
  } catch (error) {
    console.warn("[cache] collection tag revalidate failed:", error);
  }

  try {
    await clearRedisPrefixes(COLLECTION_REDIS_PREFIXES);
  } catch (error) {
    console.warn("[cache] collection redis clear failed:", error);
  }

  try {
    for (const prefix of COLLECTION_REDIS_PREFIXES) {
      clearStorefrontMemoryCache(prefix);
    }
  } catch (error) {
    console.warn("[cache] collection memory clear failed:", error);
  }

  triggerCatalogMirrorSync();
}
