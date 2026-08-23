"use client";

import AddProductToCartForm from "@/features/carts/components/AddProductToCartForm";
import { ProductPriceDisplay } from "@/features/products/components/ProductPriceDisplay";
import type { ProductDiscountFields } from "@/lib/products/discount";
import {
  resolveProductPricingForSelection,
  toProductDiscountFields,
} from "@/lib/products/pricing";
import {
  areAllOptionGroupsSelected,
  getActiveOptionGroups,
  type OptionSelections,
  type ProductSizeConfig,
} from "@/lib/products/sizeConfig-shared";
import { useMemo, useState } from "react";

type ProductBuyBoxProps = {
  productId: string;
  stock?: number | null;
  sizeConfig: ProductSizeConfig;
  pricingProduct: ProductDiscountFields;
  packLabel?: string | null;
};

export function ProductBuyBox({
  productId,
  stock,
  sizeConfig,
  pricingProduct,
  packLabel,
}: ProductBuyBoxProps) {
  const [selections, setSelections] = useState<OptionSelections>({});
  const activeGroups = useMemo(
    () => getActiveOptionGroups(sizeConfig),
    [sizeConfig],
  );
  const hasSizeOptions = activeGroups.length > 0;
  const allSelected = areAllOptionGroupsSelected(sizeConfig, selections);

  const displayPricing = useMemo(() => {
    if (!hasSizeOptions) {
      return pricingProduct;
    }

    const resolved = resolveProductPricingForSelection({
      product: pricingProduct,
      sizeConfig,
      selections,
      preferMinWhenUnselected: !allSelected,
    });
    return toProductDiscountFields(resolved);
  }, [allSelected, hasSizeOptions, pricingProduct, selections, sizeConfig]);

  const priceHint =
    hasSizeOptions && !allSelected
      ? `Tap a ${activeGroups.map((g) => g.name.toLowerCase()).join(" / ")} below to lock the price.`
      : null;

  return (
    <div className="space-y-4">
      <div>
        <ProductPriceDisplay
          product={displayPricing}
          className="mb-1"
          saleClassName="text-2xl"
          originalClassName="text-base"
        />
        {priceHint ? (
          <p className="text-xs text-muted-foreground">{priceHint}</p>
        ) : null}
        {packLabel ? (
          <p className="mt-2 text-sm font-medium text-foreground/80">
            {packLabel}
            <span className="ml-1 font-normal text-muted-foreground">
              · Qty 1 = 1 set
            </span>
          </p>
        ) : null}
      </div>

      <AddProductToCartForm
        productId={productId}
        stock={stock}
        sizeConfig={sizeConfig}
        selections={selections}
        onSelectionsChange={setSelections}
      />
    </div>
  );
}
