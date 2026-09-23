import type { Metadata } from "next";
import {
  cdnImageUrl,
  extractMediaObjectKey,
  getImageDeliveryMode,
} from "@/lib/media/cdn-image";
import { getURL, keytoUrl } from "@/lib/utils";

/** Site-wide JPG/PNG fallback for Meta/Twitter link previews (not SVG). */
export const SOCIAL_IMAGE_FALLBACK_PATH = "/images/og-default.jpg";

/** Metadata aspect hint (Meta still accepts smaller crawlable images). */
const SOCIAL_IMAGE_WIDTH = 1200;
const SOCIAL_IMAGE_HEIGHT = 630;
/**
 * Cloudflare Images: keep social CDN transforms small and JPEG so Meta/Instagram
 * crawlers accept the URL (WebP previews are unreliable).
 */
const SOCIAL_CDN_WIDTH = 400;
const SOCIAL_CDN_QUALITY = 75;
const SOCIAL_CDN_FORMAT = "jpeg" as const;

export type SocialImageResolveDeps = {
  siteOrigin: string;
  resolveMediaUrl: (key: string) => string;
  /** Override CDN social URL builder (tests). Defaults to jpeg 1200 via media CDN. */
  buildCdnSocialUrl?: (key: string) => string;
};

function normalizeSiteOrigin(siteUrl: string): string {
  return siteUrl.replace(/\/$/, "");
}

function isRejectedSocialImageUrl(url: string): boolean {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (!path) return true;
  if (path.includes("/_next/image")) return true;
  if (path.endsWith(".svg")) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith(".r2.dev")) return true;
  } catch {
    // Relative paths are checked on path only above.
  }
  return false;
}

function defaultBuildCdnSocialUrl(key: string): string {
  return cdnImageUrl(key, {
    width: SOCIAL_CDN_WIDTH,
    quality: SOCIAL_CDN_QUALITY,
    format: SOCIAL_CDN_FORMAT,
  });
}

export function absoluteSocialFallbackUrl(
  siteOrigin = normalizeSiteOrigin(getURL()),
): string {
  return `${normalizeSiteOrigin(siteOrigin)}${SOCIAL_IMAGE_FALLBACK_PATH}`;
}

/**
 * Resolve a media key/URL into an absolute HTTPS image suitable for og:image.
 * Prefers first-party media CDN JPEG; rejects SVG, Next optimizer, and *.r2.dev.
 */
export function resolveSocialImageUrl(
  keyOrUrl?: string | null,
  deps?: SocialImageResolveDeps,
): string {
  const siteOrigin = normalizeSiteOrigin(deps?.siteOrigin ?? getURL());
  const resolveMediaUrl = deps?.resolveMediaUrl ?? keytoUrl;
  const buildCdnSocialUrl = deps?.buildCdnSocialUrl ?? defaultBuildCdnSocialUrl;
  const fallback = absoluteSocialFallbackUrl(siteOrigin);

  if (!keyOrUrl?.trim()) return fallback;

  const input = keyOrUrl.trim();

  // Prefer crawlable media.thryco.com/cdn JPEG for uploads keys (incl. from .r2.dev URLs).
  const mediaKey = extractMediaObjectKey(input);
  if (mediaKey?.startsWith("uploads/") && getImageDeliveryMode() !== "legacy") {
    const cdnUrl = buildCdnSocialUrl(mediaKey);
    if (
      cdnUrl &&
      (cdnUrl.startsWith("http://") || cdnUrl.startsWith("https://")) &&
      !isRejectedSocialImageUrl(cdnUrl)
    ) {
      return cdnUrl;
    }
  }

  const resolved = resolveMediaUrl(input);
  if (!resolved || isRejectedSocialImageUrl(resolved)) return fallback;

  if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
    return isRejectedSocialImageUrl(resolved) ? fallback : resolved;
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
