"use client";

import Link from "next/link";
import { CollectionCardSurface } from "@/features/collections/components/CollectionCardSurface";
import type { StorefrontCollectionMatch } from "@/lib/storefront/search-utils";
import { keytoUrl } from "@/lib/utils";

type SearchMatchingCollectionsProps = {
  collections: StorefrontCollectionMatch[];
  searchTerm?: string | null;
};

export function SearchMatchingCollections({
  collections,
  searchTerm,
}: SearchMatchingCollectionsProps) {
  if (collections.length === 0) return null;

  return (
    <section className="pb-2">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Matching collections
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((collection) => (
          <Link
            key={collection.id}
            href={`/collections/${collection.slug}`}
            className="group block rounded-2xl border border-primary/15 bg-card p-1.5 shadow-sm transition-shadow hover:shadow-md active:scale-[0.99] sm:overflow-hidden sm:bg-muted/30 sm:p-0"
          >
            <CollectionCardSurface
              label={collection.label}
              imageSrc={keytoUrl(collection.featuredImage?.key)}
              imageAlt={collection.featuredImage?.alt || collection.label}
              sizes="(max-width: 640px) 92vw, (max-width: 1024px) 48vw, 360px"
            />
          </Link>
        ))}
      </div>
      {searchTerm ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Products from these collections are shown below.
        </p>
      ) : null}
    </section>
  );
}
