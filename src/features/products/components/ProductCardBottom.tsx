"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { ProductSizePreview } from "@/lib/products/sizeConfig-shared";
import { ProductOptionTiles } from "./ProductOptionTiles";
import ProductSizePreviewDisplay from "./ProductSizePreview";
import { AddToCartButton } from "@/features/carts";
import { AddToWishListButton } from "@/features/wishlists";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/layouts/icons";

type Props = {
  productId: string;
  stock?: number | null;
  sizePreview?: ProductSizePreview | null;
};

/**
 * Listing-card variant picker + cart actions.
 * Keeps selected variant and add-to-cart in one client island so shoppers can
 * pick size/thickness on the card without opening the product page.
 */
export function ProductCardBottom({ productId, stock, sizePreview }: Props) {
  const pickable = Boolean(
    sizePreview?.canPickOnListing && (sizePreview.choices?.length ?? 0) > 0,
  );
  const soleChoice =
    pickable && sizePreview!.choices.length === 1
      ? sizePreview!.choices[0].value
      : "";

  const [selectedVariant, setSelectedVariant] = useState(soleChoice);

  useEffect(() => {
    setSelectedVariant(soleChoice);
  }, [productId, soleChoice]);

  const tileOptions = useMemo(
    () =>
      (sizePreview?.choices ?? []).map((choice) => ({
        value: choice.value,
        label: choice.label,
        price: choice.price,
      })),
    [sizePreview?.choices],
  );

  return (
    <>
      {pickable ? (
        <ProductOptionTiles
          name={sizePreview!.optionName}
          options={tileOptions}
          value={selectedVariant}
          onChange={setSelectedVariant}
          compact
          className="mt-1"
        />
      ) : (
        <ProductSizePreviewDisplay preview={sizePreview} />
      )}

      <div className="relative z-10 mt-3 flex gap-x-2 md:gap-x-5">
        <Suspense
          fallback={
            <Button
              className="rounded-full p-0 min-h-11 min-w-11 h-11 w-11"
              disabled
            >
              <Icons.basket className="h-5 w-5 md:h-4 md:w-4" />
            </Button>
          }
        >
          <AddToCartButton
            productId={productId}
            stock={stock}
            sizePreview={sizePreview}
            selectedVariant={selectedVariant}
          />
        </Suspense>

        <Suspense
          fallback={
            <Button className="rounded-full p-3" variant="ghost" disabled>
              <Icons.heart className="w-4 h-4 fill-none" />
            </Button>
          }
        >
          <AddToWishListButton productId={productId} />
        </Suspense>
      </div>
    </>
  );
}

export default ProductCardBottom;
