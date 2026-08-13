/**
 * THRY brand mark — text wordmark only (no image lockup).
 */
export const BRAND_WORDMARK = "THRY" as const;

/**
 * Optional square mark for favicon / JSON-LD (SVG wordmark asset).
 * Storefront chrome uses {@link BRAND_WORDMARK} text, not this image.
 */
export const BRAND_LOGO = {
  src: "/images/thry-wordmark.svg",
  width: 512,
  height: 160,
} as const;

/**
 * Fixed display heights (px) for the text wordmark — keeps header metrics in sync.
 */
export const brandLogoMaxHeight = {
  nav: 40,
  md: 52,
  footer: 64,
} as const;

export type BrandLogoSize = keyof typeof brandLogoMaxHeight;
