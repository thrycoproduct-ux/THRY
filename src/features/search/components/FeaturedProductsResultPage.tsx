"use client";

import { useCallback, useMemo } from "react";
import { ProductCard, ProductCardFragment } from "@/features/products";
import { DocumentType } from "@/gql";
import {
  useDraftProductIds,
  useStorefrontFeaturedProducts,
  type StorefrontProductsInitialData,
} from "@/hooks/useStorefrontProducts";
import { useProductPackLabels } from "@/hooks/useProductPackLabels";
import { useProductSizePreviews } from "@/hooks/useProductSizePreviews";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import type { ProductSizePreview } from "@/lib/products/sizeConfig-shared";
import SearchProductsGridSkeleton from "./SearchProductsGridSkeleton";

type ProductNode = DocumentType<typeof ProductCardFragment>;

type Props = {
  variables: { first: number; after?: string | null };
  isLastPage: boolean;
  onLoadMore: (cursor: string) => void;
  initialData?: StorefrontProductsInitialData;
  initialDraftIds?: string[];
  initialPackLabels?: Record<string, string | null>;
  initialSizePreviews?: Record<string, ProductSizePreview>;
};

export function FeaturedProductsResultPage({
  variables,
  isLastPage,
  onLoadMore,
  initialData,
  initialDraftIds,
  initialPackLabels,
  initialSizePreviews,
}: Props) {
  const { productsCollection, fetching, error } = useStorefrontFeaturedProducts(
    variables,
    { initialData },
  );
  const { draftIds, draftLoaded } = useDraftProductIds(initialDraftIds);

  const visibleEdges = useMemo(
    () =>
      productsCollection?.edges.filter(({ node }) => !draftIds.has(node.id)) ??
      [],
    [draftIds, productsCollection?.edges],
  );

  const visibleIds = useMemo(
    () => visibleEdges.map(({ node }) => node.id),
    [visibleEdges],
  );
  const packLabels = useProductPackLabels(visibleIds, initialPackLabels);
  const sizePreviews = useProductSizePreviews(visibleIds, initialSizePreviews);

  const endCursor = productsCollection?.pageInfo?.endCursor ?? "";
  const canLoadMore = Boolean(
    isLastPage &&
      productsCollection?.pageInfo?.hasNextPage &&
      endCursor &&
      !fetching &&
      draftLoaded,
  );
  const requestMore = useCallback(() => {
    if (!endCursor) return;
    onLoadMore(endCursor);
  }, [endCursor, onLoadMore]);
  const sentinelRef = useInfiniteScrollSentinel({
    enabled: canLoadMore,
    onLoadMore: requestMore,
  });

  const showSkeleton =
    ((fetching && !productsCollection) || !draftLoaded) && !productsCollection;

  if (showSkeleton) {
    return <SearchProductsGridSkeleton />;
  }

  if (error) {
    return <p>Oh no... {error}</p>;
  }

  if (!productsCollection) {
    return null;
  }

  return (
    <div>
      {visibleEdges.length === 0 ? (
        <p>No featured products yet.</p>
      ) : (
        <section className="grid grid-cols-2 lg:grid-cols-4 w-full gap-y-8 gap-x-3 py-5">
          {visibleEdges.map(({ node }, index) => (
            <ProductCard
              key={node.id}
              product={node as ProductNode}
              priorityImage={!variables.after && index < 2}
              packLabel={packLabels[node.id] ?? null}
              sizePreview={sizePreviews[node.id] ?? null}
            />
          ))}
        </section>
      )}

      {isLastPage && productsCollection.pageInfo.hasNextPage ? (
        <div
          ref={sentinelRef}
          className="flex min-h-10 w-full items-center justify-center py-4"
          aria-hidden={!canLoadMore}
        >
          {fetching || canLoadMore ? (
            <p className="text-xs text-muted-foreground">
              Loading more products…
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default FeaturedProductsResultPage;
