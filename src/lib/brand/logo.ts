/**
 * THRY lockup — single source for asset + display sizes.
 * Replace `public/images/hub-of-craftss-logo.png` with THRY artwork when ready.
 */
export const BRAND_LOGO = {
  src: "/images/hub-of-craftss-logo.png",
  width: 483,
  height: 295,
} as const;

/**
 * Fixed display heights (px). Cropped art is wide (~1.64:1), so we set
 * height explicitly — max-height alone lets the nav width-squeeze shrink it.
 */
export const brandLogoMaxHeight = {
  nav: 80,
  md: 100,
  footer: 128,
} as const;

export type BrandLogoSize = keyof typeof brandLogoMaxHeight;
