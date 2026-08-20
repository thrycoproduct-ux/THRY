import type { Metadata } from "next";
import { getURL, keytoUrl } from "@/lib/utils";

/** Site-wide JPG/PNG fallback for Meta/Twitter link previews (not SVG). */
export const SOCIAL_IMAGE_FALLBACK_PATH = "/images/og-default.jpg";

const SOCIAL_IMAGE_WIDTH = 1200;
const SOCIAL_IMAGE_HEIGHT = 630;

export type SocialImageResolveDeps = {
  siteOrigin: string;
  resolveMediaUrl: (key: string) => string;
};

function normalizeSiteOrigin(siteUrl: string): string {
  return siteUrl.replace(/\/$/, "");
}

function isRejectedSocialImageUrl(url: string): boolean {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (!path) return true;
  if (path.includes("/_next/image")) return true;
  if (path.endsWith(".svg")) return true;
  return false;
}

export function absoluteSocialFallbackUrl(
  siteOrigin = normalizeSiteOrigin(getURL()),
): string {
  return `${normalizeSiteOrigin(siteOrigin)}${SOCIAL_IMAGE_FALLBACK_PATH}`;
}

/**
 * Resolve a media key/URL into an absolute HTTPS image suitable for og:image.
 * Rejects SVG and Next image-optimizer URLs; falls back to the site OG JPG.
 */
export function resolveSocialImageUrl(
  keyOrUrl?: string | null,
  deps?: SocialImageResolveDeps,
): string {
  const siteOrigin = normalizeSiteOrigin(deps?.siteOrigin ?? getURL());
  const resolveMediaUrl = deps?.resolveMediaUrl ?? keytoUrl;
  const fallback = absoluteSocialFallbackUrl(siteOrigin);

  if (!keyOrUrl?.trim()) return fallback;

  const resolved = resolveMediaUrl(keyOrUrl.trim());
  if (!resolved || isRejectedSocialImageUrl(resolved)) return fallback;

  if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
    return resolved;
  }

  if (resolved.startsWith("/")) {
    const absolute = `${siteOrigin}${resolved}`;
    return isRejectedSocialImageUrl(absolute) ? fallback : absolute;
  }

  return fallback;
}

export function buildSocialImages(
  keyOrUrl?: string | null,
  alt = "THRY",
  deps?: SocialImageResolveDeps,
): Pick<Metadata, "openGraph" | "twitter"> {
  const url = resolveSocialImageUrl(keyOrUrl, deps);
  const images = [
    {
      url,
      width: SOCIAL_IMAGE_WIDTH,
      height: SOCIAL_IMAGE_HEIGHT,
      alt,
    },
  ];

  return {
    openGraph: {
      images,
    },
    twitter: {
      card: "summary_large_image",
      images: [url],
    },
  };
}
