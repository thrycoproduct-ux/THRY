import { env } from "@/env.mjs";

export type ImageDeliveryMode = "cloudflare" | "legacy";

export type CdnImageOptions = {
  /** Target display width in CSS pixels (served via CF Images). */
  width: number;
  quality?: number;
  format?: "webp" | "avif" | "jpeg";
};

export const CDN_PRESETS = {
  thumb: { width: 200, quality: 70, format: "webp" as const },
  card: { width: 400, quality: 75, format: "webp" as const },
  pdp: { width: 800, quality: 78, format: "webp" as const },
  hero: { width: 1200, quality: 78, format: "webp" as const },
} as const;

const DEFAULT_MEDIA_ORIGIN = "https://media.thryco.com";
const FALLBACK = "/images/thry-hero-statues.svg";

export function getImageDeliveryMode(): ImageDeliveryMode {
  // Cloudflare /cdn is live on media.thryco.com (validated ~98% smaller WebP).
  // Set NEXT_PUBLIC_IMAGE_DELIVERY_MODE=legacy to roll back to raw R2 URLs.
  const raw = String(process.env.NEXT_PUBLIC_IMAGE_DELIVERY_MODE ?? "cloudflare")
    .trim()
    .toLowerCase();
  return raw === "legacy" ? "legacy" : "cloudflare";
}

function mediaOrigin(): string {
  const fromEnv = String(
    process.env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN ?? DEFAULT_MEDIA_ORIGIN,
  )
    .trim()
    .replace(/\/$/, "");
  return fromEnv || DEFAULT_MEDIA_ORIGIN;
}

function cdnPublicBase(): string | null {
  const fromProcess = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/$/, "");
  if (fromProcess) return fromProcess;
  try {
    return env.NEXT_PUBLIC_CDN_URL.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * Extract an R2 object key from a storefront media URL or raw key.
 * Returns null for local assets / unknown hosts (leave as-is).
 */
export function extractMediaObjectKey(keyOrUrl: string): string | null {
  const raw = keyOrUrl.trim();
  if (!raw || raw === FALLBACK) return null;
  if (raw.startsWith("/")) return null;

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const url = new URL(raw);
      if (url.hostname === "media.thryco.com" || url.origin === mediaOrigin()) {
        const m = url.pathname.match(/^\/cdn\/[^/]+\/(.+)$/);
        return m?.[1] ? decodeURIComponent(m[1]) : null;
      }
      const base = cdnPublicBase();
      if (base) {
        const baseUrl = new URL(base);
        if (url.hostname === baseUrl.hostname) {
          return decodeURIComponent(url.pathname.replace(/^\//, ""));
        }
      }
      if (url.hostname.endsWith(".r2.dev")) {
        return decodeURIComponent(url.pathname.replace(/^\//, ""));
      }
      return null;
    } catch {
      return null;
    }
  }

  if (raw.includes("..") || raw.startsWith("sakthi/")) return null;
  return raw.replace(/^\//, "");
}

/**
 * Build a Cloudflare Images resize URL on media.thryco.com.
 * Falls back to the original key/URL when mode is legacy or key is not CDN media.
 */
export function cdnImageUrl(
  keyOrUrl: string | null | undefined,
  options: CdnImageOptions,
): string {
  if (!keyOrUrl?.trim()) return FALLBACK;
  const input = keyOrUrl.trim();
  if (getImageDeliveryMode() === "legacy") return input;

  const key = extractMediaObjectKey(input);
  if (!key || !key.startsWith("uploads/")) {
    return input.startsWith("http") || input.startsWith("/") ? input : FALLBACK;
  }

  const width = Math.min(
    1600,
    Math.max(16, Math.round(options.width || CDN_PRESETS.card.width)),
  );
  const quality = Math.min(
    100,
    Math.max(20, Math.round(options.quality ?? CDN_PRESETS.card.quality)),
  );
  const format = options.format ?? "webp";
  const opts = `w=${width},q=${quality},f=${format}`;
  return `${mediaOrigin()}/cdn/${opts}/${key}`;
}
