import type { ProductDetailPageData } from "@/lib/storefront/product-detail-page.types";
import { cache } from "react";
import { CACHE_TAGS } from "@/lib/cache/constants";
import { withStorefrontCache } from "@/lib/cache/storefront-cache";
import {
  filterDraftEdges,
  getDraftProductIdSet,
} from "@/lib/storefront/filter-draft-products";
import { loadProductDetailPageFromDb } from "@/lib/storefront/product-detail-drizzle.server";
import { isProductSlugPublished } from "@/lib/storefront/product-visibility";
import {
  fetchD1Collections,
  fetchD1FeaturedProducts,
  fetchD1ProductBySlug,
  isCatalogD1Enabled,
} from "@/lib/catalog/d1-mirror";
import { mapD1ProductToDetailPage } from "@/lib/catalog/d1-product-card";

async function isProductSlugPublishedCached(slug: string): Promise<boolean> {
  return withStorefrontCache(
    `sf:published:${slug}`,
    () => isProductSlugPublished(slug),
    { revalidate: 60, tags: [CACHE_TAGS.products, CACHE_TAGS.drafts] },
  );
}

async function loadProductDetailFromD1(
  productSlug: string,
): Promise<ProductDetailPageData | null> {
  const [{ product, gallery }, collections, recommendations] =
    await Promise.all([
      fetchD1ProductBySlug(productSlug),
      fetchD1Collections(),
      fetchD1FeaturedProducts(5),
    ]);
  if (!product) return null;
  return mapD1ProductToDetailPage(
    product,
    gallery,
    collections,
    recommendations,
  );
}

export async function getProductDetailCached(productSlug: string) {
  const data = await withStorefrontCache(
    `sf:product:${productSlug}`,
    async () => {
      if (isCatalogD1Enabled()) {
        try {
          const fromD1 = await loadProductDetailFromD1(productSlug);
          if (fromD1) return fromD1;
        } catch (error) {
          console.warn(
            "[catalog-d1] pdp fallback to supabase:",
            error instanceof Error ? error.message : error,
          );
        }
      }

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
        } satisfies ProductDetailPageData;
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
  } satisfies ProductDetailPageData;
}

/** Returns null when the slug is draft or missing. */
export const getPublishedProductDetailCached = cache(
  async (productSlug: string) => {
    const published = await isProductSlugPublishedCached(productSlug);
    if (!published) return null;
    return getProductDetailCached(productSlug);
  },
);
