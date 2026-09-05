"use client";

import { cn, formatPrice } from "@/lib/utils";
import {
  formatDiscountBadgeLabel,
  getOriginalProductPrice,
  getSaleProductPrice,
  isProductDiscountActive,
  type ProductDiscountFields,
} from "@/lib/products/discount";
import { toGstInclusiveAmount } from "@/lib/courier/calculate";
import { useCourierChargesConfig } from "@/providers/CourierChargesProvider";

type ProductPriceDisplayProps = {
  product: ProductDiscountFields;
  className?: string;
  saleClassName?: string;
  originalClassName?: string;
  layout?: "inline" | "stacked";
  /**
   * Storefront default: show GST-inclusive prices when GST is enabled.
   * Admin catalog columns pass false to keep exclusive DB prices.
   */
  inclusive?: boolean;
};

export function ProductPriceDisplay({
  product,
  className,
  saleClassName,
  originalClassName,
  layout = "stacked",
  inclusive = true,
}: ProductPriceDisplayProps) {
  const courierConfig = useCourierChargesConfig();
  const onSale = isProductDiscountActive(product);
  const saleExclusive = getSaleProductPrice(product);
  const originalExclusive = getOriginalProductPrice(product);
  const salePrice = inclusive
    ? toGstInclusiveAmount(saleExclusive, courierConfig)
    : saleExclusive;
  const originalPrice = inclusive
    ? toGstInclusiveAmount(originalExclusive, courierConfig)
    : originalExclusive;

  if (!onSale) {
    return (
      <div className={cn("craft-price-pill", className)}>
        {formatPrice(salePrice)}
      </div>
    );
  }

  if (layout === "inline") {
    return (
      <div
        className={cn(
          "craft-price-pill flex-wrap items-baseline gap-x-2 gap-y-0.5",
          className,
        )}
      >
        <span className={cn("font-semibold text-destructive", saleClassName)}>
          {formatPrice(salePrice)}
        </span>
        <span
          className={cn(
            "text-sm text-muted-foreground line-through",
            originalClassName,
          )}
        >
          {formatPrice(originalPrice)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn("craft-price-pill flex-col items-start gap-0.5", className)}
    >
      <div className={cn("font-semibold text-destructive", saleClassName)}>
        {formatPrice(salePrice)}
      </div>
      <div
        className={cn(
          "text-sm text-muted-foreground line-through",
          originalClassName,
        )}
      >
        {formatPrice(originalPrice)}
      </div>
    </div>
  );
}

type ProductDiscountBadgeProps = {
  product: ProductDiscountFields;
  className?: string;
};

export function ProductDiscountBadge({
  product,
  className,
}: ProductDiscountBadgeProps) {
  if (!isProductDiscountActive(product)) return null;

  const percent = Number(product.discountPercent);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-secondary bg-secondary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground shadow-sm",
        className,
      )}
    >
      {formatDiscountBadgeLabel(percent)}
    </span>
  );
}
