"use client";

import type { StorefrontProductsInitialData } from "@/hooks/useStorefrontProducts";
import { useListingNavigationState } from "@/hooks/useListingNavigationState";
import type { ProductSizePreview } from "@/lib/products/sizeConfig-shared";
import { usePathname } from "next/navigation";
import FeaturedProductsResultPage from "./FeaturedProductsResultPage";

const PAGE_SIZE = 12;

type Props = {
  initialData?: StorefrontProductsInitialData;
  initialDraftIds?: string[];
  initialPackLabels?: Record<string, string | null>;
  initialSizePreviews?: Record<string, ProductSizePreview>;
};

export function FeaturedProductsScroll({
  initialData,
  initialDraftIds,
  initialPackLabels,
  initialSizePreviews,
}: Props) {
  const pathname = usePathname();
  const [pageVariables, setPageVariables] = useListingNavigationState(
    pathname,
    () => [{ first: PAGE_SIZE, after: undefined as string | undefined }],
  );

  const loadMoreHandler = (after: string) => {
    setPageVariables((prev) => {
      if (prev.some((page) => page.after === after)) return prev;
      return [...prev, { first: PAGE_SIZE, after }];
    });
  };

  return (
    <section>
      {pageVariables.map((variable, i) => (
        <FeaturedProductsResultPage
          key={String(variable.after ?? "initial")}
          variables={variable}
          isLastPage={i === pageVariables.length - 1}
          onLoadMore={loadMoreHandler}
          initialData={i === 0 ? initialData : undefined}
          initialDraftIds={i === 0 ? initialDraftIds : undefined}
          initialPackLabels={i === 0 ? initialPackLabels : undefined}
          initialSizePreviews={i === 0 ? initialSizePreviews : undefined}
        />
      ))}
    </section>
  );
}

export default FeaturedProductsScroll;
