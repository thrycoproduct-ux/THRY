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
  isCatalogD1Enabled,
} from "@/lib/catalog/d1-mirror";
import { mapD1ProductsToCollection } from "@/lib/catalog/d1-product-card";

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

  const hasPrice = Boolean(queryVariables.lower && queryVariables.upper);

  const cacheKey = `sf:products:search:${stableKey({
    ...queryVariables,
    matchingCollectionIds: matchingCollections.map(
      (collection) => collection.id,
    ),
    engine: hasPrice ? "sql-effective-price" : "graphql",
  })}`;

  const productsCollection = await withStorefrontCache(
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
 * Shop search / PDP / cart stay on Supabase.
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
