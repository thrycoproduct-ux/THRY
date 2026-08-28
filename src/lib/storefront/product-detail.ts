import type { ProductDetailPageQueryQuery } from "@/gql/graphql";
import { cache } from "react";
import { CACHE_TAGS } from "@/lib/cache/constants";
import { withStorefrontCache } from "@/lib/cache/storefront-cache";
import {
  filterDraftEdges,
  getDraftProductIdSet,
} from "@/lib/storefront/filter-draft-products";
import { loadProductDetailPageFromDb } from "@/lib/storefront/product-detail-drizzle.server";
import { isProductSlugPublished } from "@/lib/storefront/product-visibility";

async function isProductSlugPublishedCached(slug: string): Promise<boolean> {
  return withStorefrontCache(
    `sf:published:${slug}`,
    () => isProductSlugPublished(slug),
    { revalidate: 60, tags: [CACHE_TAGS.products, CACHE_TAGS.drafts] },
  );
}

export async function getProductDetailCached(productSlug: string) {
  const data = await withStorefrontCache(
    `sf:product:${productSlug}`,
    async () => {
      const loaded = await loadProductDetailPageFromDb(productSlug);
      if (!loaded) {
        return {
          __typename: "Query",
          productsCollection: {
            __typename: "productsConnection",
            edges: [],
          },
          recommendations: {
            __typename: "productsConnection",
            edges: [],
          },
        } satisfies ProductDetailPageQueryQuery;
      }
      return loaded;
    },
    { tags: [CACHE_TAGS.products, CACHE_TAGS.drafts] },
  );

  if (!data?.recommendations?.edges?.length) return data;

  const draftIds = await getDraftProductIdSet();
  return {
    ...data,
    recommendations: filterDraftEdges(data.recommendations, draftIds),
  } satisfies ProductDetailPageQueryQuery;
}

/** Returns null when the slug is draft or missing. */
export const getPublishedProductDetailCached = cache(
  async (productSlug: string) => {
    const published = await isProductSlugPublishedCached(productSlug);
    if (!published) return null;
    return getProductDetailCached(productSlug);
  },
);
