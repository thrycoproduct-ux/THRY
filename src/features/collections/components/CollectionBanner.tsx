import { gql, DocumentType } from "@/gql";
import React from "react";

const CollectionBannerFragment = gql(/* GraphQL */ `
  fragment CollectionBannerFragment on collections {
    id
    label
    slug
    featuredImage: medias {
      id
      key
      alt
    }
  }
`);

/**
 * Text-only collection PLP header (no hero image).
 * Featured image stays in the GraphQL fragment for OG/Twitter metadata only.
 */
function CollectionBanner({
  collectionBannerData,
}: {
  collectionBannerData: DocumentType<typeof CollectionBannerFragment>;
}) {
  const { label } = collectionBannerData;

  return (
    <header className="mb-6 w-full md:mb-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-magenta/80 sm:text-sm">
        THRY collection
      </p>
      <h1 className="mt-1 font-[family-name:var(--font-hero-serif)] text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl">
        {label}
      </h1>
    </header>
  );
}

export default CollectionBanner;
