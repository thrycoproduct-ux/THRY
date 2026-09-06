"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  cdnImageUrl,
  cdnPresetForWidth,
  type CdnImageOptions,
} from "@/lib/media/cdn-image";
import {
  getStorefrontImageProps,
  STOREFRONT_IMAGE_FALLBACK,
} from "@/lib/utils";

type Props = Omit<ImageProps, "onError" | "src"> & {
  src: string;
  /**
   * When set, rewrite R2/CDN URLs through Cloudflare Images resize
   * (media.thryco.com/cdn/...). Ignored for local SVGs / legacy mode.
   * Prefer `cdnOptions` when a named preset (e.g. heroMobile) must match preload.
   */
  optimizeWidth?: number;
  /** Explicit CDN options; wins over optimizeWidth when both are set. */
  cdnOptions?: CdnImageOptions;
};

/**
 * Storefront photo with a local fallback when the CDN URL 404s or fails.
 */
export function StorefrontImage({
  src,
  alt,
  optimizeWidth,
  cdnOptions,
  ...props
}: Props) {
  const [failed, setFailed] = useState(false);

  const optimizedSrc = useMemo(() => {
    if (!src || src === STOREFRONT_IMAGE_FALLBACK) return src;
    if (cdnOptions) return cdnImageUrl(src, cdnOptions);
    if (optimizeWidth == null) return src;
    return cdnImageUrl(src, cdnPresetForWidth(optimizeWidth));
  }, [src, optimizeWidth, cdnOptions]);

  useEffect(() => {
    setFailed(false);
  }, [optimizedSrc]);

  const displaySrc =
    !optimizedSrc || failed || optimizedSrc === STOREFRONT_IMAGE_FALLBACK
      ? STOREFRONT_IMAGE_FALLBACK
      : optimizedSrc;

  return (
    <Image
      src={displaySrc}
      alt={alt ?? ""}
      {...props}
      {...getStorefrontImageProps(displaySrc)}
      onError={() => {
        if (displaySrc !== STOREFRONT_IMAGE_FALLBACK) setFailed(true);
      }}
    />
  );
}
