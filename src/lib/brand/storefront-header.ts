import { shopBoardSizeConfig } from "./shop-board";

/** Matches `AnnouncementBar` text rail */
const ANNOUNCEMENT_BAR_PX = 38;

/** Matches `MobileNavbar` row height (`h-16`) */
const NAV_MOBILE_ROW_PX = 64;

/** Matches desktop nav container `py-1` (4px × 2) */
const NAV_DESKTOP_PADDING_Y_PX = 8;

/** Matches `.brand-board-lockup--nav` in globals.css */
const NAV_MOBILE_LOCKUP_SCALE = 0.94;

/** Drop-shadow / descender buffer below fixed header */
const EMBLEM_CLEARANCE_PX = 4;

function estimateLockupHeight(size: "nav" | "md", scale = 1): number {
  const config = shopBoardSizeConfig[size];
  const nameHeightPx = config.nameFontPx * 1.15;
  const locationHeightPx = config.locationFontPx * 1.2;
  const panelContentHeightPx = nameHeightPx + 4 + locationHeightPx;
  const panelHeightPx = Math.max(
    config.panelMinHeight,
    panelContentHeightPx + config.panelPadY * 2,
  );

  return Math.ceil(Math.max(config.emblemPx, panelHeightPx) * scale);
}

function pxToRem(px: number): string {
  return `${px / 16}rem`;
}

export function computeStorefrontHeaderMetrics() {
  const navLockupPx = estimateLockupHeight("nav", NAV_MOBILE_LOCKUP_SCALE);
  const desktopLockupPx = estimateLockupHeight("md");

  const navMobilePx = Math.max(NAV_MOBILE_ROW_PX, navLockupPx + 8);
  const navDesktopPx = NAV_DESKTOP_PADDING_Y_PX + desktopLockupPx;

  const offsetMobilePx =
    ANNOUNCEMENT_BAR_PX + navMobilePx + EMBLEM_CLEARANCE_PX;
  const offsetDesktopPx =
    ANNOUNCEMENT_BAR_PX + navDesktopPx + EMBLEM_CLEARANCE_PX;

  return {
    announcementBarPx: ANNOUNCEMENT_BAR_PX,
    navLockupMobilePx: navLockupPx,
    navLockupDesktopPx: desktopLockupPx,
    navMobilePx,
    navDesktopPx,
    emblemClearancePx: EMBLEM_CLEARANCE_PX,
    offsetMobilePx,
    offsetDesktopPx,
  };
}

export function storefrontHeaderCssVarDeclarations(): Record<string, string> {
  const metrics = computeStorefrontHeaderMetrics();

  return {
    "--announcement-bar-height": pxToRem(metrics.announcementBarPx),
    "--store-nav-content-height-mobile": pxToRem(metrics.navLockupMobilePx),
    "--store-nav-content-height-desktop": pxToRem(metrics.navLockupDesktopPx),
    "--store-nav-height-mobile": pxToRem(metrics.navMobilePx),
    "--store-nav-height-desktop": pxToRem(metrics.navDesktopPx),
    "--store-emblem-clearance": pxToRem(metrics.emblemClearancePx),
    "--store-header-offset-mobile": pxToRem(metrics.offsetMobilePx),
    "--store-header-offset-desktop": pxToRem(metrics.offsetDesktopPx),
  };
}

export function storefrontHeaderStyleContent(): string {
  const declarations = Object.entries(storefrontHeaderCssVarDeclarations())
    .map(([name, value]) => `${name}: ${value}`)
    .join("; ");

  return `:root { ${declarations}; }`;
}
