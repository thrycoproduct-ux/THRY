"use client";

import { useEffect, useState } from "react";
import AddProductToCartForm from "@/features/carts/components/AddProductToCartForm";
import { BuyNowButton } from "@/features/products";
import { ProductPriceDisplay } from "@/features/products/components/ProductPriceDisplay";
import type { ProductDiscountFields } from "@/lib/products/discount";
import {
  getActiveOptionGroups,
  type ProductSizeConfig,
} from "@/lib/products/sizeConfig-shared";
import { useCheckoutChrome } from "@/providers/CheckoutChromeProvider";
import { Button } from "@/components/ui/button";

const BUY_BOX_ID = "product-buy-box";

type Props = {
  productId: string;
  stock?: number | null;
  sizeConfig: ProductSizeConfig;
  pricingProduct: ProductDiscountFields;
  /** True when PDP uses ProductBuyBox (size / option groups). */
  hasConfiguredSizes: boolean;
};

/**
 * Mobile-only sticky buy CTA above the bottom nav when the inline buy box
 * scrolls off-screen (Shopify-style above-the-fold safety net).
 */
export function ProductMobileStickyBuyBar({
  productId,
  stock,
  sizeConfig,
  pricingProduct,
  hasConfiguredSizes,
}: Props) {
  const { hideStoreChrome } = useCheckoutChrome();
  const [show, setShow] = useState(false);
  const hasSizeOptions = getActiveOptionGroups(sizeConfig).length > 0;
  const needsOptions = hasConfiguredSizes || hasSizeOptions;

  useEffect(() => {
    if (hideStoreChrome) {
      setShow(false);
      return;
    }

    const target = document.getElementById(BUY_BOX_ID);
    if (!target || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShow(!entry.isIntersecting);
      },
      {
        // Leave room for header; treat as "visible" when any of the buy box shows
        root: null,
        rootMargin: "-8% 0px -12% 0px",
        threshold: 0.05,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hideStoreChrome]);

  if (hideStoreChrome || !show) return null;

  const scrollToBuyBox = () => {
    const el = document.getElementById(BUY_BOX_ID);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      const focusable = el?.querySelector<HTMLElement>(
        "button, [role='radio'], input, select",
      );
      focusable?.focus({ preventScroll: true });
    }, 350);
  };

  return (
    <div
      className="fixed inset-x-0 z-[210] border-t border-border bg-background/95 px-3 py-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm md:hidden"
      style={{ bottom: "var(--mobile-nav-height)" }}
      role="region"
      aria-label="Buy product"
    >
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <div className="min-w-0 flex-1">
          <ProductPriceDisplay
            product={pricingProduct}
            className="mb-0"
            saleClassName="text-lg"
            originalClassName="text-xs"
          />
        </div>

        {needsOptions ? (
          <Button
            type="button"
            className="shrink-0 min-h-11 px-5"
            onClick={scrollToBuyBox}
          >
            Add to cart
          </Button>
        ) : (
          <div className="flex shrink-0 items-end gap-2">
            <AddProductToCartForm
              productId={productId}
              stock={stock}
              sizeConfig={sizeConfig}
            />
            <BuyNowButton productId={productId} stock={stock} />
          </div>
        )}
      </div>
    </div>
  );
}

export { BUY_BOX_ID };
