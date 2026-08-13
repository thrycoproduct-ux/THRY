import { siteConfig } from "@/config/site";
import { BRAND_WORDMARK, brandLogoMaxHeight } from "@/lib/brand/logo";
import { cn } from "@/lib/utils";
import type { ShopBoardBrandSize } from "@/lib/brand/shop-board";

export type BrandWordmarkSize = ShopBoardBrandSize;

type Props = {
  className?: string;
  size?: BrandWordmarkSize;
  align?: "left" | "center";
};

const sizeClass: Record<BrandWordmarkSize, string> = {
  nav: "text-[2rem] leading-none md:text-[2.15rem]",
  md: "text-[2.5rem] leading-none",
  footer: "text-[3rem] leading-none",
};

/** THRY text wordmark — colorful girl-forward brand lockup. */
export function BrandWordmark({
  className,
  size = "md",
  align = "left",
}: Props) {
  const height = brandLogoMaxHeight[size];

  return (
    <span
      className={cn(
        "brand-board-lockup brand-wordmark inline-flex shrink-0 items-center",
        size === "nav" && "brand-board-lockup--nav",
        align === "center" && "mx-auto justify-center",
        className,
      )}
      style={{ minHeight: height }}
      aria-label={`${siteConfig.shopBoardName} — ${siteConfig.tagline}`}
    >
      <span
        className={cn(
          "brand-wordmark-text relative z-[2] select-none font-[family-name:var(--font-brand-sans)] font-extrabold tracking-tight",
          sizeClass[size],
        )}
      >
        {BRAND_WORDMARK}
      </span>
    </span>
  );
}

export default BrandWordmark;
