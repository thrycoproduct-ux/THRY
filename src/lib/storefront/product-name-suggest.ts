import db from "@/lib/supabase/db";
import { collections, medias, products } from "@/lib/supabase/schema";
import {
  CACHE_TAGS,
  STOREFRONT_REVALIDATE_SECONDS,
} from "@/lib/cache/constants";
import { withStorefrontCache } from "@/lib/cache/storefront-cache";
import { and, eq, sql } from "drizzle-orm";
import { categorizedPublishedProductConditions } from "./categorized-products";
import {
  clampSuggestLimit,
  PRODUCT_SUGGEST_MAX_LIMIT,
  sanitizeSuggestQuery as sanitizeSuggestQueryBase,
  type ProductNameSuggestion,
} from "./product-name-suggest-shared";
import { normalizeStorefrontSearchTerm } from "./search-utils";

export {
  clampSuggestLimit,
  PRODUCT_SUGGEST_DEFAULT_LIMIT,
  PRODUCT_SUGGEST_MAX_CHARS,
  PRODUCT_SUGGEST_MAX_LIMIT,
  PRODUCT_SUGGEST_MIN_CHARS,
  type ProductNameSuggestion,
} from "./product-name-suggest-shared";

export function sanitizeSuggestQuery(raw: string | null | undefined) {
  return sanitizeSuggestQueryBase(raw, normalizeStorefrontSearchTerm);
}

function rankSuggestions(
  rows: ProductNameSuggestion[],
  term: string,
): ProductNameSuggestion[] {
  const needle = term.toLowerCase();
  return [...rows].sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aStarts = aName.startsWith(needle) ? 0 : 1;
    const bStarts = bName.startsWith(needle) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    const aIndex = aName.indexOf(needle);
    const bIndex = bName.indexOf(needle);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return aName.localeCompare(bName);
  });
}

async function loadProductNameSuggestions(
  term: string,
  limit: number,
): Promise<ProductNameSuggestion[]> {
  const pattern = `%${term}%`;
  const fetchLimit = Math.min(PRODUCT_SUGGEST_MAX_LIMIT * 2, limit * 3);

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      mediaKey: medias.key,
      mediaAlt: medias.alt,
    })
    .from(products)
    .innerJoin(collections, eq(products.collectionId, collections.id))
    .leftJoin(medias, eq(products.featuredImageId, medias.id))
    .where(
      and(
        categorizedPublishedProductConditions(),
        sql`${products.name} ILIKE ${pattern}`,
      ),
    )
    .limit(fetchLimit);

  const mapped: ProductNameSuggestion[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    featuredImage: row.mediaKey
      ? { key: row.mediaKey, alt: row.mediaAlt }
      : null,
  }));

  return rankSuggestions(mapped, term).slice(0, limit);
}

export async function fetchProductNameSuggestionsCached(
  rawQuery: string | null | undefined,
  rawLimit?: unknown,
): Promise<{ query: string | null; suggestions: ProductNameSuggestion[] }> {
  const term = sanitizeSuggestQuery(rawQuery);
  const limit = clampSuggestLimit(rawLimit);

  if (!term) {
    return { query: null, suggestions: [] };
  }

  const cacheKey = `sf:products:suggest:${term.toLowerCase()}:${limit}`;
  const suggestions = await withStorefrontCache(
    cacheKey,
    () => loadProductNameSuggestions(term, limit),
    {
      revalidate: STOREFRONT_REVALIDATE_SECONDS,
      tags: [CACHE_TAGS.products, CACHE_TAGS.drafts],
    },
  );

  return { query: term, suggestions };
}
