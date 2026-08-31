import { Shell } from "@/components/layouts/Shell";
import { Skeleton } from "@/components/ui/skeleton";
import { CollectionBanner } from "@/features/collections";
import { SearchProductsGridSkeleton } from "@/features/products";
import {
  FilterSelections,
  ListingFilterNavigationProvider,
  SearchProductsInifiteScroll,
} from "@/features/search";
import { STOREFRONT_REVALIDATE_SECONDS } from "@/lib/cache/constants";
import { getCollectionPageCached } from "@/lib/storefront/collection-detail";
import { SectionErrorNotice } from "@/components/errors/SectionErrorNotice";
import { withFallback } from "@/lib/resilience";
import { getDraftProductIdsSafe } from "@/lib/storefront/draft-product-ids";
import {
  fetchProductSearchCached,
  type StorefrontProductSearchResult,
} from "@/lib/storefront/product-queries";
import { buildShopSearchVariables } from "@/lib/storefront/search-params";
import { getProductPackLabelsByIds } from "@/lib/products/pack.server";
import { getProductSizePreviewsByIds } from "@/lib/products/sizeConfig";
import { buildSocialImages } from "@/lib/seo/social-image";
import { toTitleCase, unslugify } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

export const revalidate = 120;

interface CategoryPageProps {
  params: Promise<{
    collectionSlug: string;
  }>;
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const path = `/collections/${resolvedParams.collectionSlug}`;
  const data = await getCollectionPageCached(resolvedParams.collectionSlug);
  const collection = data?.collectionsCollection?.edges?.[0]?.node;
  const collectionName =
    collection?.label?.trim() ||
    collection?.title?.trim() ||
    toTitleCase(unslugify(resolvedParams.collectionSlug));
  const description =
    collection?.description?.trim() ||
    `Shop ${collectionName} craft supplies at THRY. Premium terracotta and craft supplies with secure online ordering.`;
  const social = buildSocialImages(
    collection?.featuredImage?.key,
    collectionName,
  );

  return {
    title: collectionName,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: `${collectionName} | THRY`,
      description,
      url: path,
      ...social.openGraph,
    },
    twitter: {
      ...social.twitter,
      title: `${collectionName} | THRY`,
      description,
    },
  };
}

async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const requestedSlug = decodeURIComponent(
    resolvedParams.collectionSlug,
  ).trim();
  const data = await getCollectionPageCached(requestedSlug);
  const collection = data?.collectionsCollection?.edges?.[0]?.node;

  if (!collection?.id) return notFound();

  if (requestedSlug !== collection.slug) {
    redirect(`/collections/${encodeURIComponent(collection.slug)}`);
  }

  const variables = buildShopSearchVariables(
    resolvedSearchParams,
    collection.id,
  );
  const [searchResult, initialDraftIds] = await Promise.all([
    withFallback<StorefrontProductSearchResult | null>(
      "collection:search",
      () => fetchProductSearchCached(variables),
      null,
    ),
    getDraftProductIdsSafe(),
  ]);

  const productsUnavailable = searchResult === null || initialDraftIds === null;
  const initialSearchResult = searchResult ?? {
    productsCollection: null,
    matchingCollections: [],
  };
  const initialProductIds =
    initialSearchResult?.productsCollection?.edges?.map(
      ({ node }) => node.id,
    ) ?? [];
  const [initialPackLabels, initialSizePreviews] = await Promise.all([
    getProductPackLabelsByIds(initialProductIds),
    getProductSizePreviewsByIds(initialProductIds),
  ]);

  return (
    <Shell>
      <CollectionBanner collectionBannerData={collection} />

      <ListingFilterNavigationProvider>
        <Suspense
          fallback={
            <div>
              <Skeleton className="max-w-xl h-8 mb-3" />
              <Skeleton className="max-w-2xl h-8" />
            </div>
          }
        >
          <FilterSelections shopLayout={false} />
        </Suspense>

        {productsUnavailable ? (
          <SectionErrorNotice
            title="We could not load products in this collection"
            description="This is usually temporary. Please try again in a moment."
          />
        ) : (
          <Suspense fallback={<SearchProductsGridSkeleton />}>
            <SearchProductsInifiteScroll
              collectionId={collection.id}
              initialSearchResult={initialSearchResult}
              initialDraftIds={initialDraftIds ?? []}
              initialPackLabels={initialPackLabels}
              initialSizePreviews={initialSizePreviews}
            />
          </Suspense>
        )}
      </ListingFilterNavigationProvider>
    </Shell>
  );
}

export default CategoryPage;
