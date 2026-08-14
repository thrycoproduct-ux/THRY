import { Shell } from "@/components/layouts/Shell";
import { DeferredStoreButterflies } from "@/components/layouts/DeferredStoreButterflies";
import { Icons } from "@/components/layouts/icons";
import {
  HomeHeroCarousel,
  HomeCategoriesCarousel,
  HomeExploreLinks,
} from "@/features/storefront/components";
import dynamic from "next/dynamic";
import { heroSlides } from "@/config/heroSlides";
import { getHomeBannerSlidesCached } from "@/lib/integrations/settings";
import { withTimeoutFallback } from "@/lib/resilience";
import { getDraftProductIdsSafe } from "@/lib/storefront/draft-product-ids";
import { getLandingPageDataCached } from "@/lib/storefront/landing-data";
import { getShopByPriceBucketsCached } from "@/lib/storefront/shop-by-price";
import { getProductPackLabelsByIds } from "@/lib/products/pack.server";
import { siteConfig } from "@/config/site";
import { cn, keytoUrl } from "@/lib/utils";
import type { Metadata } from "next";

const HomePriceCarousel = dynamic(() =>
  import("@/features/storefront/components/HomePriceCarousel").then(
    (mod) => mod.HomePriceCarousel,
  ),
);
const HomeShoppableReels = dynamic(() =>
  import("@/features/storefront/components/HomeShoppableReels").then(
    (mod) => mod.HomeShoppableReels,
  ),
);
const HomeTestimonialsCarousel = dynamic(() =>
  import("@/features/storefront/components/HomeTestimonialsCarousel").then(
    (mod) => mod.HomeTestimonialsCarousel,
  ),
);

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Creative 3D printed products",
  description:
    "Shop creative 3D printed products at THRY — art & craft tools, customised gifts, statues, planters and more.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "THRY | Creative 3D printed products",
    description:
      "Shop creative 3D printed products at THRY — art & craft tools, gifts, statues and home essentials.",
    url: "/",
  },
};

const SECTION_TIMEOUT_MS = 5000;

export default async function Home() {
  const [homeBannerSlides, data, draftProductIds, priceBuckets] =
    await Promise.all([
      withTimeoutFallback(
        "home:banner",
        getHomeBannerSlidesCached(),
        SECTION_TIMEOUT_MS,
        null,
      ),
      withTimeoutFallback(
        "home:landing",
        getLandingPageDataCached(),
        SECTION_TIMEOUT_MS,
        null,
      ),
      withTimeoutFallback<string[] | null>(
        "home:drafts",
        getDraftProductIdsSafe(),
        SECTION_TIMEOUT_MS,
        null,
      ),
      withTimeoutFallback<
        Awaited<ReturnType<typeof getShopByPriceBucketsCached>>
      >(
        "home:priceBuckets",
        getShopByPriceBucketsCached(),
        SECTION_TIMEOUT_MS,
        [],
      ),
    ]);

  // Contact comes from store layout providers; use site default for this section only.
  const phone = siteConfig.phone;

  // Without the draft list we cannot prove a product is publishable, so the
  // reels section stays empty rather than risking an unfinished listing.
  const draftIds = draftProductIds === null ? null : new Set(draftProductIds);
  const products = data?.products;
  const featuredProducts =
    draftIds === null
      ? []
      : products?.edges?.filter((edge) => !draftIds.has(edge.node.id)) ?? [];
  const collectionScrollCards = data?.collectionScrollCards;
  const homeTestimonials = data?.homeTestimonials;
  const slides = homeBannerSlides?.length ? homeBannerSlides : heroSlides;

  const featuredPackLabels = await getProductPackLabelsByIds(
    featuredProducts.map(({ node }) => node.id),
  );

  const firstCategoryImageKey =
    collectionScrollCards?.edges?.find((edge) => edge.node.featuredImage?.key)
      ?.node.featuredImage?.key ?? null;
  const firstCategoryImageSrc = firstCategoryImageKey
    ? keytoUrl(firstCategoryImageKey)
    : null;

  return (
    <main className="min-h-screen w-full min-w-0 overflow-x-hidden">
      {firstCategoryImageSrc ? (
        <link
          rel="preload"
          as="image"
          href={firstCategoryImageSrc}
          fetchPriority="high"
        />
      ) : null}
      <DeferredStoreButterflies />
      <HomeHeroCarousel slides={slides} />

      <Shell>
        {!data ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 my-6 text-sm">
            <p className="font-semibold mb-2">Store data not loaded</p>
            <p className="text-muted-foreground mb-2">
              Enable GraphQL in Supabase: SQL Editor → run{" "}
              <code className="bg-card px-1">
                supabase/02-enable-graphql.sql
              </code>
            </p>
          </div>
        ) : null}

        {collectionScrollCards?.edges?.length ? (
          <HomeCategoriesCarousel
            initialEdges={collectionScrollCards.edges}
            initialPageInfo={{
              hasNextPage: Boolean(collectionScrollCards.pageInfo?.hasNextPage),
              endCursor: collectionScrollCards.pageInfo?.endCursor ?? null,
            }}
          />
        ) : null}

        {priceBuckets.length ? (
          <HomePriceCarousel buckets={priceBuckets} />
        ) : null}

        {featuredProducts.length ? (
          <HomeShoppableReels
            products={featuredProducts}
            packLabels={featuredPackLabels}
          />
        ) : null}

        {homeTestimonials?.edges?.length ? (
          <HomeTestimonialsCarousel testimonials={homeTestimonials.edges} />
        ) : null}

        <HomeExploreLinks />
        <TrustFeatures phone={phone} />
      </Shell>
    </main>
  );
}

function TrustFeatures({ phone }: { phone: string }) {
  const features = [
    {
      Icon: Icons.package,
      title: "Affordable Shipping",
      description: "Low delivery charges for orders across India.",
      iconClass: "text-brand-rose",
    },
    {
      Icon: Icons.cart,
      title: "Contact Support",
      description: `Call ${phone} or email us anytime.`,
      iconClass: "text-brand-gold",
    },
    {
      Icon: Icons.tag,
      title: "Easy Replacement",
      description: "Simple returns on eligible items.",
      iconClass: "text-brand-rose",
    },
    {
      Icon: Icons.award,
      title: "Secure Checkout",
      description: "Safe, trusted payment flow.",
      iconClass: "text-brand-gold",
    },
  ];

  return (
    <section className="craft-stitch grid grid-cols-2 gap-6 rounded-2xl border-brand-gold/30 bg-card/80 px-3 py-10 md:grid-cols-4 md:gap-10 md:px-6 md:py-16">
      {features.map(({ Icon, title, description, iconClass }, index) => (
        <div className="text-center px-2" key={`trust_${index}`}>
          <div className="mb-3 flex justify-center">
            <span
              className={cn(
                "inline-flex h-12 w-12 items-center justify-center rounded-full bg-card shadow-[0_8px_24px_-12px_rgba(192,48,120,0.35)] ring-1 ring-brand-rose/15",
              )}
            >
              <Icon className={cn("h-6 w-6", iconClass)} />
            </span>
          </div>
          <h4 className="text-sm md:text-base font-semibold mb-1">{title}</h4>
          <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      ))}
    </section>
  );
}
