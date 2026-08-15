"use client";

import React, { useCallback, useEffect, useState } from "react";
import { gql, DocumentType } from "@/gql";
import { StorefrontImage } from "@/components/media/StorefrontImage";
import { Icons } from "@/components/layouts/icons";
import { cn, keytoUrl } from "@/lib/utils";
import {
  productImageTransitionName,
  viewTransitionStyle,
} from "@/lib/view-transitions";

type ProductImageShowcaseProps = React.HTMLAttributes<HTMLDivElement> & {
  data: DocumentType<typeof ProductImageShowcaseFragment>;
  viewTransitionKey?: string;
};

const ProductImageShowcaseFragment = gql(/* GraphQL */ `
  fragment ProductImageShowcaseFragment on products {
    id
    featuredImage: medias {
      id
      key
      alt
    }

    images: product_mediasCollection(orderBy: [{ priority: DescNullsLast }]) {
      edges {
        node {
          media {
            id
            key
            alt
          }
        }
      }
    }
  }
`);

type GalleryImage = {
  id: string;
  key: string;
  alt: string;
};

function ProductImageShowcase({
  data,
  viewTransitionKey,
  className,
}: ProductImageShowcaseProps) {
  const transitionName = productImageTransitionName(
    viewTransitionKey ?? data.id,
  );
  const galleryMedias =
    data.images?.edges.map(({ node }) => node.media).filter(Boolean) || [];
  const seen = new Set<string>();
  const allImages: GalleryImage[] = [];
  for (const image of [data.featuredImage, ...galleryMedias]) {
    if (!image?.id || !image.key || seen.has(image.id)) continue;
    seen.add(image.id);
    allImages.push({
      id: image.id,
      key: image.key,
      alt: image.alt || "",
    });
  }

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const safeIndex =
    allImages.length === 0
      ? 0
      : Math.min(activeImageIndex, allImages.length - 1);

  useEffect(() => {
    if (activeImageIndex !== safeIndex) {
      setActiveImageIndex(safeIndex);
    }
  }, [activeImageIndex, safeIndex]);

  const goNext = useCallback(() => {
    setActiveImageIndex((prev) =>
      allImages.length === 0 ? 0 : Math.min(prev + 1, allImages.length - 1),
    );
  }, [allImages.length]);

  const goPrev = useCallback(() => {
    setActiveImageIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  if (allImages.length === 0) {
    return (
      <div
        className={cn(
          "w-full min-w-0 overflow-hidden rounded-md bg-muted aspect-[3/4] max-h-[70vh]",
          className,
        )}
      />
    );
  }

  const activeImage = allImages[safeIndex];
  const activeImageSrc = keytoUrl(activeImage.key);
  const hasMultiple = allImages.length > 1;

  return (
    <section
      className={cn(
        "w-full min-w-0 max-w-full overflow-hidden",
        "flex flex-col md:flex-row md:items-start gap-3 md:gap-4",
        className,
      )}
    >
      {/* Desktop: vertical thumb strip */}
      {hasMultiple ? (
        <div className="hidden md:flex md:flex-col md:gap-2 md:w-16 md:shrink-0 md:max-h-[min(70vh,36rem)] md:overflow-y-auto">
          {allImages.map((image, index) => {
            const imageSrc = keytoUrl(image.key);
            const isActive = index === safeIndex;
            return (
              <button
                key={image.id}
                type="button"
                aria-label={`Show image ${index + 1}`}
                aria-pressed={isActive}
                onClick={() => setActiveImageIndex(index)}
                className={cn(
                  "relative h-20 w-16 shrink-0 overflow-hidden rounded-md border bg-muted",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "border-foreground ring-1 ring-foreground"
                    : "border-border hover:border-foreground/40",
                )}
              >
                <StorefrontImage
                  src={imageSrc}
                  alt={image.alt || `Product thumbnail ${index + 1}`}
                  fill
                  sizes="64px"
                  className="object-cover object-top"
                />
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Main image — full product visible (contain), not cropped */}
      <div className="relative w-full min-w-0 flex-1">
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-md bg-muted",
            "aspect-[3/4] max-h-[min(70vh,36rem)]",
          )}
        >
          <StorefrontImage
            src={activeImageSrc}
            alt={activeImage.alt || "Product image"}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 55vw, 640px"
            className="object-contain object-center"
            style={viewTransitionStyle(transitionName)}
            priority
          />

          {hasMultiple ? (
            <>
              <button
                type="button"
                aria-label="Previous image"
                onClick={goPrev}
                disabled={safeIndex === 0}
                className={cn(
                  "absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white",
                  "disabled:opacity-30 md:hidden",
                )}
              >
                <Icons.chevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Next image"
                onClick={goNext}
                disabled={safeIndex >= allImages.length - 1}
                className={cn(
                  "absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white",
                  "disabled:opacity-30 md:hidden",
                )}
              >
                <Icons.chevronRight className="h-5 w-5" />
              </button>
            </>
          ) : null}
        </div>

        {/* Mobile: horizontal thumb strip under main */}
        {hasMultiple ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {allImages.map((image, index) => {
              const imageSrc = keytoUrl(image.key);
              const isActive = index === safeIndex;
              return (
                <button
                  key={image.id}
                  type="button"
                  aria-label={`Show image ${index + 1}`}
                  aria-pressed={isActive}
                  onClick={() => setActiveImageIndex(index)}
                  className={cn(
                    "relative h-16 w-14 shrink-0 overflow-hidden rounded-md border bg-muted",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "border-foreground ring-1 ring-foreground"
                      : "border-border",
                  )}
                >
                  <StorefrontImage
                    src={imageSrc}
                    alt={image.alt || `Product thumbnail ${index + 1}`}
                    fill
                    sizes="56px"
                    className="object-cover object-top"
                  />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default ProductImageShowcase;
