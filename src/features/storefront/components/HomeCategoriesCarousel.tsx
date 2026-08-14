"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CollectionCardSurface } from "@/features/collections/components/CollectionCardSurface";
import { ViewTransitionLink } from "@/components/ui/ViewTransitionLink";
import { keytoUrl } from "@/lib/utils";
import { collectionImageTransitionName } from "@/lib/view-transitions";
import {
  HOME_CATEGORIES_PAGE_SIZE,
  type HomeCategoriesPage,
  type HomeCategoryNode,
} from "@/lib/storefront/collections-page";
import { HomeSectionHeader } from "./HomeSectionHeader";

type Props = {
  initialEdges: { node: HomeCategoryNode }[];
  initialPageInfo: {
    hasNextPage: boolean;
    endCursor?: string | null;
  };
};

function mergeEdges(
  current: { node: HomeCategoryNode }[],
  incoming: { node: HomeCategoryNode }[],
) {
  const seen = new Set(current.map((edge) => edge.node.id));
  const next = [...current];
  for (const edge of incoming) {
    if (!edge?.node?.id || seen.has(edge.node.id)) continue;
    seen.add(edge.node.id);
    next.push(edge);
  }
  return next;
}

/** Homepage categories grid with scroll-to-load pagination. */
export function HomeCategoriesCarousel({
  initialEdges,
  initialPageInfo,
}: Props) {
  const [edges, setEdges] = useState(initialEdges);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const pageInfoRef = useRef(pageInfo);

  useEffect(() => {
    setEdges(initialEdges);
    setPageInfo(initialPageInfo);
    pageInfoRef.current = initialPageInfo;
    setError(null);
  }, [initialEdges, initialPageInfo]);

  useEffect(() => {
    pageInfoRef.current = pageInfo;
  }, [pageInfo]);

  const loadMore = useCallback(async () => {
    const current = pageInfoRef.current;
    if (loadingRef.current || !current.hasNextPage || !current.endCursor) {
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        first: String(HOME_CATEGORIES_PAGE_SIZE),
        after: current.endCursor,
      });
      const res = await fetch(`/api/storefront/collections?${params}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error("Could not load more categories.");
      }
      const body = (await res.json()) as HomeCategoriesPage;
      setEdges((prev) => mergeEdges(prev, body.edges ?? []));
      const nextInfo = {
        hasNextPage: Boolean(body.pageInfo?.hasNextPage),
        endCursor: body.pageInfo?.endCursor ?? null,
      };
      pageInfoRef.current = nextInfo;
      setPageInfo(nextInfo);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load more categories.",
      );
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !pageInfo.hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root: null, rootMargin: "240px 0px", threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, pageInfo.hasNextPage, edges.length]);

  if (!edges.length) return null;

  return (
    <section className="w-full min-w-0 py-4 sm:py-8 md:py-10">
      <HomeSectionHeader
        title="Product"
        titleAccent="Categories"
        href="/collections"
        showViewMore={false}
      />
      <section
        aria-label="Product categories"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-6"
      >
        {edges.map(({ node }, index) => {
          const imageKey = node.featuredImage?.key;
          if (!imageKey) return null;
          return (
            <div key={node.id} className="w-full">
              <ViewTransitionLink
                href={`/collections/${node.slug}`}
                className="group block w-full rounded-[1.25rem] border border-brand-teal/20 bg-card p-1.5 shadow-sm transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-brand-magenta/40 hover:shadow-[0_18px_40px_-18px_rgba(192,48,120,0.35)] sm:overflow-hidden sm:bg-muted/30 sm:p-0"
              >
                <CollectionCardSurface
                  label={node.label}
                  imageSrc={keytoUrl(imageKey)}
                  imageAlt={node.featuredImage?.alt || node.label}
                  sizes="(max-width: 640px) 48vw, (max-width: 1024px) 31vw, 260px"
                  priority={index < 2}
                  viewTransitionName={collectionImageTransitionName(node.id)}
                />
              </ViewTransitionLink>
            </div>
          );
        })}
      </section>

      <div
        ref={sentinelRef}
        className="h-8 w-full"
        aria-hidden={!pageInfo.hasNextPage}
      />

      {loading ? (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Loading more categories…
        </p>
      ) : null}

      {error ? (
        <div className="mt-2 flex flex-col items-center gap-2">
          <p className="text-center text-xs text-destructive">{error}</p>
          <button
            type="button"
            className="text-xs font-semibold text-brand-rose underline-offset-2 hover:underline"
            onClick={() => void loadMore()}
          >
            Try again
          </button>
        </div>
      ) : null}
    </section>
  );
}
