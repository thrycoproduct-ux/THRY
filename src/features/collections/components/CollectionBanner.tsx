import { gql, DocumentType } from "@/gql";
import { keytoUrl } from "@/lib/utils";
import { StorefrontImage } from "@/components/media/StorefrontImage";
import React from "react";
import {
  collectionImageTransitionName,
  viewTransitionStyle,
} from "@/lib/view-transitions";

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

function CollectionBanner({
  collectionBannerData,
}: {
  collectionBannerData: DocumentType<typeof CollectionBannerFragment>;
}) {
  const { label, featuredImage, id } = collectionBannerData;
  const imageKey = featuredImage?.key;
  const imageAlt = featuredImage?.alt || label;

  const imageSrc = keytoUrl(imageKey);

  return (
    <div className="relative mx-auto mb-8 h-[220px] w-full overflow-hidden md:container md:h-[280px]">
      <StorefrontImage
        src={imageSrc}
        alt={imageAlt}
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
        style={viewTransitionStyle(collectionImageTransitionName(id))}
      />
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
        <div className="border-l-[4px] border-brand-orange pl-3 sm:pl-4">
          <h1 className="font-[family-name:var(--font-hero-serif)] text-2xl font-semibold leading-tight text-white drop-shadow-md md:text-5xl">
            {label}
          </h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-yellow sm:text-sm">
            THRY collection
          </p>
        </div>
      </div>
    </div>
  );
}

export default CollectionBanner;
