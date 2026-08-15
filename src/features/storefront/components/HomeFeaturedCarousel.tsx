"use client";

import { StorefrontImage } from "@/components/media/StorefrontImage";
import { Suspense } from "react";
import { DocumentType, gql } from "@/gql";
import { ProductCardSkeleton } from "@/features/products";
import {
  ProductDiscountBadge,
  ProductPriceDisplay,
} from "@/features/products/components/ProductPriceDisplay";
import { AddToCartButton } from "@/features/carts";
import { AddToWishListButton } from "@/features/wishlists";
import { ViewTransitionLink } from "@/components/ui/ViewTransitionLink";
import { Badge } from "@/components/ui/badge";
import { keytoUrl } from "@/lib/utils";
import {
  productImageTransitionName,
  viewTransitionStyle,
} from "@/lib/view-transitions";
import { HomeSectionHeader } from "./HomeSectionHeader";
import {
  HomeScrollSnapStrip,
  ScrollSnapItem,
  scrollSnapFeaturedItemClass,
} from "./HomeScrollSnapStrip";
import {
  MotionHoverLift,
  MotionRevealItem,
  MotionSection,
} from "./MotionSection";

export const HomeFeaturedProductFragment = gql(/* GraphQL */ `
  fragment HomeFeaturedProductFragment on products {
    id
    name
    slug
    badge
    price
    discountEnabled: discount_enabled
    discountPercent: discount_percent
    featuredImage: medias {
      id
      key
      alt
    }
  }
`);

type ProductNode = DocumentType<typeof HomeFeaturedProductFragment>;

type Props = {
  products: { node: ProductNode }[];
  packLabels?: Record<string, string | null>;
};

function FeaturedSlide({
  product,
  packLabel,
}: {
  product: ProductNode;
  packLabel?: string | null;
}) {
  const { id, name, slug, featuredImage, badge } = product;

  const imageSrc = keytoUrl(featuredImage?.key);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-brand-teal/15 bg-card shadow-[0_14px_36px_-22px_rgba(72,168,180,0.4)]">
      <div className="relative w-full aspect-[3/4] max-h-[min(72vh,440px)] bg-muted">
        <ViewTransitionLink href={`/shop/${slug}`} className="absolute inset-0">
          <StorefrontImage
            src={imageSrc}
            alt={featuredImage?.alt || name}
            fill
            sizes="(max-width: 640px) 78vw, (max-width: 1024px) 42vw, 360px"
            className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.04]"
            style={viewTransitionStyle(productImageTransitionName(id))}
            loading="lazy"
          />
        </ViewTransitionLink>
        <ProductDiscountBadge
          product={product}
          className="absolute top-3 left-3 z-10 pointer-events-none"
        />
        {badge ? (
          <Badge
            className="absolute top-3 right-3 z-10 pointer-events-none"
            variant={badge as "default"}
          >
            {badge}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col justify-center p-3 sm:p-4">
        <ViewTransitionLink href={`/shop/${slug}`}>
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base hover:text-primary">
            {name}
          </h3>
        </ViewTransitionLink>
        <ProductPriceDisplay product={product} className="mt-1" />
        {packLabel ? (
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">
            {packLabel}
          </p>
        ) : null}
        <div className="relative z-10 mt-3 flex items-center gap-2">
          <Suspense fallback={<span className="inline-block h-11 w-11" />}>
            <AddToWishListButton productId={id} />
          </Suspense>
          <Suspense fallback={<span className="inline-block h-11 w-11" />}>
            <AddToCartButton productId={id} />
          </Suspense>
        </div>
      </div>
    </article>
  );
}

export function HomeFeaturedCarousel({ products, packLabels }: Props) {
  if (!products.length) return null;

  return (
    <MotionSection className="w-full min-w-0 py-4 sm:py-8 md:py-10">
      <HomeSectionHeader
        title="Featured"
        titleAccent="Products"
        href="/featured"
      />
      <HomeScrollSnapStrip ariaLabel="Featured products">
        {products.map(({ node }, index) => (
          <ScrollSnapItem key={node.id} className={scrollSnapFeaturedItemClass}>
            <MotionRevealItem index={index} className="group h-full">
              <MotionHoverLift className="h-full">
                <FeaturedSlide
                  product={node}
                  packLabel={packLabels?.[node.id]}
                />
              </MotionHoverLift>
            </MotionRevealItem>
          </ScrollSnapItem>
        ))}
      </HomeScrollSnapStrip>
    </MotionSection>
  );
}

export function HomeFeaturedCarouselSkeleton() {
  return (
    <section className="py-6">
      <div className="mb-4 h-8 w-48 animate-pulse rounded bg-muted" />
      <ProductCardSkeleton />
    </section>
  );
}
