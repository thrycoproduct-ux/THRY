import Header from "@/components/layouts/Header";
import { Shell } from "@/components/layouts/Shell";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchProductsGridSkeleton } from "@/features/products";
import {
  FilterSelections,
  SearchProductsInifiteScroll,
} from "@/features/search";
import { SectionErrorNotice } from "@/components/errors/SectionErrorNotice";
import { STOREFRONT_REVALIDATE_SECONDS } from "@/lib/cache/constants";
import { getProductPackLabelsByIds } from "@/lib/products/pack.server";
import { withFallback } from "@/lib/resilience";
import { getAllCollectionsCached } from "@/lib/storefront/collections-list";
import { getDraftProductIdsSafe } from "@/lib/storefront/draft-product-ids";
import {
  fetchProductSearchCached,
  type StorefrontProductSearchResult,
} from "@/lib/storefront/product-queries";
import {
  buildShopSearchVariables,
  formatShopPriceRangeHeading,
} from "@/lib/storefront/search-params";
import type { Metadata } from "next";
import { Suspense } from "react";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Shop All Products",
  description:
    "Browse all silk, cotton, wedding and festive craft supplies at THRY. Shop online with secure checkout and delivery across India.",
  alternates: {
    canonical: "/shop",
  },
  openGraph: {
    title: "Shop All Products | THRY",
    description:
      "Browse all silk, cotton, wedding and festive craft supplies at THRY.",
    url: "/shop",
  },
};

interface ProductsPageProps {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}

async function ProductsPage({ searchParams }: ProductsPageProps) {
  const resolvedSearchParams = await searchParams;
  const variables = buildShopSearchVariables(resolvedSearchParams);
  const priceHeading = formatShopPriceRangeHeading(resolvedSearchParams);
  const [searchResult, initialDraftIds, collectionsData] = await Promise.all([
    withFallback<StorefrontProductSearchResult | null>(
      "shop:search",
      () => fetchProductSearchCached(variables),
      null,
    ),
    getDraftProductIdsSafe(),
    withFallback("shop:collections", () => getAllCollectionsCached(), null),
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
  const initialPackLabels = await getProductPackLabelsByIds(initialProductIds);

  const collectionsSection =
    collectionsData?.edges?.map(({ node }) => ({
      id: node.id,
      label: node.label,
    })) ?? [];

  return (
    <Shell>
      <Header
        heading={priceHeading ? "Shop by Price" : "Shop Now"}
        description={
          priceHeading
            ? `Sarees priced ${priceHeading}. Use filters below to refine further.`
            : undefined
        }
      />

      <Suspense
        fallback={
          <div>
            <Skeleton className="mb-3 h-8 max-w-xl" />
            <Skeleton className="h-8 max-w-2xl" />
          </div>
        }
      >
        <FilterSelections collectionsSection={collectionsSection} />
      </Suspense>

      {productsUnavailable ? (
        <SectionErrorNotice
          title="We could not load products right now"
          description="Our catalogue is briefly unavailable. Please try again in a moment."
        />
      ) : (
        <Suspense fallback={<SearchProductsGridSkeleton />}>
          <SearchProductsInifiteScroll
            initialSearchResult={initialSearchResult}
            initialDraftIds={initialDraftIds ?? []}
            initialPackLabels={initialPackLabels}
          />
        </Suspense>
      )}
    </Shell>
  );
}

export default ProductsPage;
