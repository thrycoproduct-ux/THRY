"use client";

import type { SearchQueryVariables } from "@/gql/graphql";
import { ProductCard, ProductCardFragment } from "@/features/products";
import { DocumentType } from "@/gql";
import {
  useDraftProductIds,
  useStorefrontProductSearch,
  type StorefrontProductsInitialData,
} from "@/hooks/useStorefrontProducts";
import { useProductPackLabels } from "@/hooks/useProductPackLabels";
import { useProductSizePreviews } from "@/hooks/useProductSizePreviews";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import { normalizeStorefrontSearchTerm } from "@/lib/storefront/search-utils";
import { formatPriceRangeLabel } from "@/lib/storefront/shop-by-price-buckets";
import type { ProductSizePreview } from "@/lib/products/sizeConfig-shared";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { SearchMatchingCollections } from "./SearchMatchingCollections";
import SearchProductsGridSkeleton from "./SearchProductsGridSkeleton";

type ProductNode = DocumentType<typeof ProductCardFragment>;

const SearchResultPage = ({
  variables,
  onLoadMore,
  isLastPage,
  collectionId,
  showMatchingCollections = false,
  initialData,
  initialDraftIds,
  initialPackLabels,
  initialSizePreviews,
}: {
  variables: SearchQueryVariables;
  onLoadMore: (cursor: string) => void;
  isLastPage: boolean;
  collectionId?: string;
  showMatchingCollections?: boolean;
  initialData?: StorefrontProductsInitialData;
  initialDraftIds?: string[];
  initialPackLabels?: Record<string, string | null>;
  initialSizePreviews?: Record<string, ProductSizePreview>;
}) => {
  const searchParams = useSearchParams();
  const { productsCollection, matchingCollections, fetching, error } =
    useStorefrontProductSearch(variables, collectionId, { initialData });
  const { draftIds, draftLoaded } = useDraftProductIds(initialDraftIds);

  const searchTerm = normalizeStorefrontSearchTerm(variables.search);
  const priceRangeLabel = useMemo(() => {
    const raw = searchParams.get("price_range")?.trim();
    if (!raw) return null;
    const [minRaw, maxRaw] = raw.split("-");
    const min = Number.parseInt(minRaw ?? "", 10);
    const max = Number.parseInt(maxRaw ?? "", 10);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      return null;
    }
    return formatPriceRangeLabel(min, max);
  }, [searchParams]);

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

  const hasCollectionMatches =
    showMatchingCollections && matchingCollections.length > 0;
  const hasProductMatches = visibleEdges.length > 0;
  const hasAnyMatches = hasCollectionMatches || hasProductMatches;
  const showSkeleton = (fetching || !draftLoaded) && !productsCollection;

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

  return (
    <div>
      {error && <p>Oh no... {error}</p>}

      {showSkeleton && <SearchProductsGridSkeleton />}

      {productsCollection && draftLoaded && !showSkeleton && (
        <>
          {hasCollectionMatches ? (
            <SearchMatchingCollections
              collections={matchingCollections}
              searchTerm={searchTerm}
            />
          ) : null}

          {!hasAnyMatches && searchTerm ? (
            <p>
              No products or collections match{" "}
              <span className="font-bold">{searchTerm}</span>.
            </p>
          ) : null}

          {!hasAnyMatches && !searchTerm && priceRangeLabel ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No products found in{" "}
              <span className="font-semibold text-foreground">
                {priceRangeLabel}
              </span>
              . Try another price range or browse all products.
            </p>
          ) : null}

          {hasProductMatches ? (
            <section className="grid grid-cols-2 w-full gap-x-3 gap-y-8 py-5 lg:grid-cols-4">
              {visibleEdges.map(({ node }, index) => (
                <ProductCard
                  key={node.id}
                  product={node as ProductNode}
                  priorityImage={showMatchingCollections && index < 2}
                  packLabel={packLabels[node.id] ?? null}
                  sizePreview={sizePreviews[node.id] ?? null}
                />
              ))}
            </section>
          ) : hasCollectionMatches ? (
            <p className="py-2 text-sm text-muted-foreground">
              No individual products matched this search, but the collections
              above may have what you need.
            </p>
          ) : null}

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
        </>
      )}
    </div>
  );
};

export default SearchResultPage;
