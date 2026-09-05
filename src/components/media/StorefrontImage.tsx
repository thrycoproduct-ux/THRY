"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useMemo, useState } from "react";
import { CDN_PRESETS, cdnImageUrl } from "@/lib/media/cdn-image";
import {
  getStorefrontImageProps,
  STOREFRONT_IMAGE_FALLBACK,
} from "@/lib/utils";

type Props = Omit<ImageProps, "onError" | "src"> & {
  src: string;
  /**
   * When set, rewrite R2/CDN URLs through Cloudflare Images resize
   * (media.thryco.com/cdn/...). Ignored for local SVGs / legacy mode.
   */
  optimizeWidth?: number;
};

/**
 * Storefront photo with a local fallback when the CDN URL 404s or fails.
 */
export function StorefrontImage({
  src,
  alt,
  optimizeWidth,
  ...props
}: Props) {
  const [failed, setFailed] = useState(false);

  const optimizedSrc = useMemo(() => {
    if (!src || src === STOREFRONT_IMAGE_FALLBACK) return src;
    if (optimizeWidth == null) return src;
    return cdnImageUrl(src, {
      width: optimizeWidth,
      quality: CDN_PRESETS.card.quality,
      format: "webp",
    });
  }, [src, optimizeWidth]);

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
