"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useState } from "react";
import {
  getStorefrontImageProps,
  STOREFRONT_IMAGE_FALLBACK,
} from "@/lib/utils";

type Props = Omit<ImageProps, "onError" | "src"> & {
  src: string;
};

/**
 * Storefront photo with a local fallback when the CDN URL 404s or fails.
 */
export function StorefrontImage({ src, alt, ...props }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const displaySrc =
    !src || failed || src === STOREFRONT_IMAGE_FALLBACK
      ? STOREFRONT_IMAGE_FALLBACK
      : src;

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
