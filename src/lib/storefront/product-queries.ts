import type {
  FeaturedProductsQueryQuery,
  FeaturedProductsQueryQueryVariables,
  SearchQuery,
  SearchQueryVariables,
} from "@/gql/graphql";
import type { StorefrontProductSearchVariables } from "@/lib/storefront/search-params";
import { getClient } from "@/lib/urql";
import { CACHE_TAGS } from "@/lib/cache/constants";
import { withStorefrontCache } from "@/lib/cache/storefront-cache";
import { filterDraftProductsFromCollection } from "./filter-draft-products";
import { findMatchingCollections } from "./collection-search";
import { fetchProductsByEffectivePriceRange } from "./product-price-search";
import {
  NO_COLLECTION_MATCH_ID,
  normalizeStorefrontSearchTerm,
  type StorefrontCollectionMatch,
} from "./search-utils";
import {
  FeaturedProductsQueryDocument,
  SearchInCollectionQueryDocument,
  SearchQueryDocument,
} from "./documents";
import {
  fetchD1Collections,
  fetchD1FeaturedProducts,
  fetchD1ProductSearch,
  isCatalogD1Enabled,
  mapStorefrontOrderByToD1Sort,
} from "@/lib/catalog/d1-mirror";
import { mapD1ProductsToCollection } from "@/lib/catalog/d1-product-card";
import { parsePaginationOffset } from "@/lib/storefront/effective-price";

function stableKey(parts: Record<string, unknown>) {
  return JSON.stringify(parts);
}

export type StorefrontProductSearchResult = {
  productsCollection: SearchQuery["productsCollection"] | null;
  matchingCollections: StorefrontCollectionMatch[];
};

function pickSearchDocument(variables: StorefrontProductSearchVariables) {
  const hasCollection = Boolean(variables.collections?.length);

  if (hasCollection) {
    return SearchInCollectionQueryDocument;
  }
  return SearchQueryDocument;
}

async function fetchProductSearchFromSupabase(
  queryVariables: StorefrontProductSearchVariables,
  matchingCollections: StorefrontCollectionMatch[],
): Promise<SearchQuery["productsCollection"] | null> {
  const hasPrice = Boolean(queryVariables.lower && queryVariables.upper);

  const cacheKey = `sf:products:search:${stableKey({
    ...queryVariables,
    matchingCollectionIds: matchingCollections.map(
      (collection) => collection.id,
    ),
    engine: hasPrice ? "sql-effective-price" : "graphql",
  })}`;

  return withStorefrontCache(
    cacheKey,
    async () => {
      if (hasPrice) {
        return fetchProductsByEffectivePriceRange(queryVariables);
      }

      const document = pickSearchDocument(queryVariables);
      const { data, error } = await getClient().query<SearchQuery>(
        document,
        queryVariables as SearchQueryVariables,
      );
      if (error) throw error;
      return data?.productsCollection ?? null;
    },
    { tags: [CACHE_TAGS.products, CACHE_TAGS.drafts] },
  );
}

async function tryFetchProductSearchFromD1(
  variables: StorefrontProductSearchVariables,
): Promise<SearchQuery["productsCollection"] | null> {
  const offset = parsePaginationOffset(variables.after);
  const limit = Math.min(Math.max(1, variables.first || 4), 24);
  const searchTerm = normalizeStorefrontSearchTerm(variables.search);
  const priceMin = variables.lower ? Number(variables.lower) : null;
  const priceMax = variables.upper ? Number(variables.upper) : null;
  const hasPrice =
    priceMin != null &&
    priceMax != null &&
    Number.isFinite(priceMin) &&
    Number.isFinite(priceMax);

  const [result, collections] = await Promise.all([
    fetchD1ProductSearch({
      q: searchTerm,
      sort: mapStorefrontOrderByToD1Sort(variables.orderBy),
      priceMin: hasPrice ? priceMin : null,
      priceMax: hasPrice ? priceMax : null,
      collectionId: variables.collections?.[0] ?? null,
      requireCollection: hasPrice,
      limit,
      offset,
    }),
    fetchD1Collections(),
  ]);

  if (result.products.length === 0 && offset === 0) {
    return null;
  }

  return mapD1ProductsToCollection(result.products, collections, {
    hasNextPage: result.hasMore,
    endCursor: result.hasMore ? String(offset + result.products.length) : null,
  }) as unknown as SearchQuery["productsCollection"];
}

export async function fetchProductSearchCached(
  variables: StorefrontProductSearchVariables,
): Promise<StorefrontProductSearchResult> {
  const searchTerm = normalizeStorefrontSearchTerm(variables.search);
  const matchingCollections = searchTerm
    ? await findMatchingCollections(searchTerm)
    : [];

  const matchedCollectionIds =
    matchingCollections.length > 0
      ? matchingCollections.map((collection) => collection.id)
      : [NO_COLLECTION_MATCH_ID];

  const queryVariables: StorefrontProductSearchVariables = {
    ...variables,
    matchedCollectionIds,
  };

  if (isCatalogD1Enabled()) {
    try {
      // Collection-name matches expand GraphQL OR logic; use Supabase when present.
      if (matchingCollections.length === 0) {
        const d1Collection = await tryFetchProductSearchFromD1(queryVariables);
        if (d1Collection) {
          return {
            productsCollection:
              await filterDraftProductsFromCollection(d1Collection),
            matchingCollections: [],
          };
        }
      }
    } catch (error) {
      console.warn(
        "[catalog-d1] search fallback to supabase:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const productsCollection = await fetchProductSearchFromSupabase(
    queryVariables,
    matchingCollections,
  );

  return {
    productsCollection:
      await filterDraftProductsFromCollection(productsCollection),
    matchingCollections: searchTerm ? matchingCollections : [],
  };
}

async function fetchFeaturedProductsFromSupabase(variables: {
  first: number;
  after?: string | null;
}) {
  const cacheKey = `sf:products:featured:${stableKey(variables)}`;

  const productsCollection = await withStorefrontCache(
    cacheKey,
    async () => {
      const { data, error } = await getClient().query<
        FeaturedProductsQueryQuery,
        FeaturedProductsQueryQueryVariables
      >(FeaturedProductsQueryDocument, variables);
      if (error) throw error;
      return data?.productsCollection ?? null;
    },
    { tags: [CACHE_TAGS.products, CACHE_TAGS.drafts] },
  );

  return filterDraftProductsFromCollection(productsCollection);
}

/**
 * Featured listing: optional D1 mirror when CATALOG_READ=d1.
 * Always falls back to Supabase+Redis on any D1 failure.
 */
export async function fetchFeaturedProductsCached(variables: {
  first: number;
  after?: string | null;
}) {
  if (isCatalogD1Enabled() && !variables.after) {
    try {
      const [products, collections] = await Promise.all([
        fetchD1FeaturedProducts(variables.first),
        fetchD1Collections(),
      ]);
      if (products.length > 0) {
        return mapD1ProductsToCollection(products, collections, {
          hasNextPage: products.length >= variables.first,
          endCursor: null,
        }) as unknown as NonNullable<
          Awaited<ReturnType<typeof fetchFeaturedProductsFromSupabase>>
        >;
      }
    } catch (error) {
      console.warn(
        "[catalog-d1] featured fallback to supabase:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return fetchFeaturedProductsFromSupabase(variables);
}
