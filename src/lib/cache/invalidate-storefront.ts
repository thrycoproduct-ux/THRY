import { revalidateTag } from "next/cache";
import { ADMIN_PRODUCTS_LIST_TAG } from "@/lib/admin/getAdminProductsList";
import { CACHE_TAGS } from "./constants";
import { redisDelByPrefix } from "./redis";
import { clearStorefrontMemoryCache } from "./storefront-cache";

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
}

/**
 * Category-only catalog changes: fewer Redis KEYS scans + less Fluid Active CPU
 * than a full storefront bust.
 */
export async function invalidateStorefrontCollectionsCache() {
  try {
    revalidateTag(CACHE_TAGS.collections);
    revalidateTag(CACHE_TAGS.products);
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
}
