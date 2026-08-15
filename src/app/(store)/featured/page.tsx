import Header from "@/components/layouts/Header";
import { Shell } from "@/components/layouts/Shell";
import { SearchProductsGridSkeleton } from "@/features/products";
import { FeaturedProductsScroll } from "@/features/search";
import { Suspense } from "react";
import { Metadata } from "next";
import { SectionErrorNotice } from "@/components/errors/SectionErrorNotice";
import { STOREFRONT_REVALIDATE_SECONDS } from "@/lib/cache/constants";
import { withFallback } from "@/lib/resilience";
import { getDraftProductIdsSafe } from "@/lib/storefront/draft-product-ids";
import { fetchFeaturedProductsCached } from "@/lib/storefront/product-queries";
import { getProductPackLabelsByIds } from "@/lib/products/pack.server";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Featured Products",
  description:
    "Discover handpicked featured craft supplies at THRY — premium styles for weddings, festivals and special occasions.",
  alternates: {
    canonical: "/featured",
  },
  openGraph: {
    title: "Featured Products | THRY",
    description:
      "Discover handpicked featured craft supplies at THRY for weddings and festivals.",
    url: "/featured",
  },
};

const FEATURED_PAGE_SIZE = 12;

async function FeaturedProductsPage() {
  const variables = { first: FEATURED_PAGE_SIZE, after: undefined };
  const [featured, initialDraftIds] = await Promise.all([
    withFallback<Awaited<
      ReturnType<typeof fetchFeaturedProductsCached>
    > | null>(
      "featured:products",
      () => fetchFeaturedProductsCached(variables),
      null,
    ),
    getDraftProductIdsSafe(),
  ]);

  const featuredUnavailable = featured === null || initialDraftIds === null;
  const productsCollection = featured ?? null;
  const initialProductIds =
    productsCollection?.edges?.map(({ node }) => node.id) ?? [];
  const initialPackLabels = await getProductPackLabelsByIds(initialProductIds);

  return (
    <Shell>
      <Header
        heading="Featured Products"
        description="Our handpicked craft supplies — materials for make, craft, create"
      />

      {featuredUnavailable ? (
        <SectionErrorNotice
          title="We could not load featured products"
          description="This is usually temporary. Please try again in a moment."
        />
      ) : (
        <Suspense fallback={<SearchProductsGridSkeleton />}>
          <FeaturedProductsScroll
            initialData={{ productsCollection }}
            initialDraftIds={initialDraftIds ?? []}
            initialPackLabels={initialPackLabels}
          />
        </Suspense>
      )}
    </Shell>
  );
}

export default FeaturedProductsPage;
