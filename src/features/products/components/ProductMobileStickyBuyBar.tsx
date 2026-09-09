"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useBottomDockHeight } from "@/hooks/useBottomDockHeight";
import { ProductPriceDisplay } from "@/features/products/components/ProductPriceDisplay";
import type { ProductDiscountFields } from "@/lib/products/discount";
import {
  getActiveOptionGroups,
  type ProductSizeConfig,
} from "@/lib/products/sizeConfig-shared";
import { useAuth } from "@/providers/AuthProvider";
import { useCheckoutChrome } from "@/providers/CheckoutChromeProvider";
import { useStockControlConfig } from "@/providers/StockControlProvider";
import useCartActions from "@/features/carts/hooks/useCartActions";
import { productSizeConfigToCartConfig } from "@/features/carts/cart-options-guard";

export const BUY_BOX_ID = "product-buy-box";

type Props = {
  productId: string;
  stock?: number | null;
  sizeConfig: ProductSizeConfig;
  pricingProduct: ProductDiscountFields;
  hasConfiguredSizes: boolean;
};

/**
 * Mobile sticky ATC above bottom nav when buy box is off-screen (Shopify-style).
 * In-app browser strip lives in InAppBrowserBannerGate (server UA → first paint).
 */
export function ProductMobileStickyBuyBar({
  productId,
  stock,
  sizeConfig,
  pricingProduct,
  hasConfiguredSizes,
}: Props) {
  const { hideStoreChrome } = useCheckoutChrome();
  const [show, setShow] = useState(true);
  const hasSizeOptions = getActiveOptionGroups(sizeConfig).length > 0;
  const needsOptions = hasConfiguredSizes || hasSizeOptions;

  const { user } = useAuth();
  const stockControl = useStockControlConfig();
  const { addProductToCart } = useCartActions(user, productId, stock ?? null);
  const [adding, setAdding] = useState(false);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const visible = !hideStoreChrome && show;
  useBottomDockHeight(dockRef, visible);

  const isOutOfStock =
    stockControl.enabled &&
    typeof stock === "number" &&
    stock <= 0 &&
    !hasSizeOptions;

  useEffect(() => {
    if (hideStoreChrome) {
      setShow(false);
      return;
    }

    const target = document.getElementById(BUY_BOX_ID);
    if (!target || typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShow(!entry.isIntersecting);
      },
      {
        root: null,
        rootMargin: "-8% 0px -12% 0px",
        threshold: 0.05,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hideStoreChrome]);

  if (!visible) return null;

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

  const addSimple = async () => {
    if (isOutOfStock || adding) return;
    setAdding(true);
    try {
      await addProductToCart(1, {
        sizeConfigHint: sizeConfig
          ? productSizeConfigToCartConfig(sizeConfig)
          : undefined,
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      ref={dockRef}
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
            className="min-h-11 shrink-0 px-5"
            onClick={scrollToBuyBox}
          >
            Add to cart
          </Button>
        ) : (
          <Button
            type="button"
            className="min-h-11 shrink-0 px-5"
            disabled={isOutOfStock || adding}
            onClick={() => void addSimple()}
          >
            {isOutOfStock ? "Out of stock" : adding ? "Adding…" : "Add to cart"}
          </Button>
        )}
      </div>
    </div>
  );
}
