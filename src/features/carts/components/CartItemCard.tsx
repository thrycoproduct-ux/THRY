"use client";
import { DocumentType } from "@/gql";
import { CartItemCardFragment } from "../fragments/CartItemCardFragment";

import { StorefrontImage } from "@/components/media/StorefrontImage";
import React from "react";

import QuantityInput from "../../../components/layouts/QuantityInput";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ProductPriceDisplay } from "@/features/products/components/ProductPriceDisplay";
import { ProductOptionTiles } from "@/features/products/components/ProductOptionTiles";
import { formatProductPackLabel } from "@/lib/products/pack";
import { keytoUrl } from "@/lib/utils";
import { UseQueryExecute } from "@urql/next";
import Link from "next/link";
import { Icons } from "../../../components/layouts/icons";
import { Button } from "../../../components/ui/button";

export { CartItemCardFragment };

type OptionGroupSelect = {
  id: string;
  name: string;
  options: { value: string; label: string }[];
};

type CartItemCardProps = React.ComponentProps<typeof Card> & {
  product: DocumentType<typeof CartItemCardFragment> & {
    soldAsPack?: boolean | null;
    packSize?: number | null;
  };
  disabled?: boolean;
  addOneHandler: () => void;
  minusOneHandler: () => void;
  removeHandler: () => void;
  quantity: number;
  selectedSize?: string;
  selections?: Record<string, string>;
  sizeRequired?: boolean;
  optionName?: string;
  sizeOptions?: { value: string; label: string }[];
  optionGroups?: OptionGroupSelect[];
  onSizeChange?: (size: string) => void;
  onSelectionsChange?: (selections: Record<string, string>) => void;
};

function CartItemCard({
  product,
  disabled,
  addOneHandler,
  minusOneHandler,
  removeHandler,
  quantity,
  selectedSize,
  selections,
  sizeRequired,
  optionName = "Size",
  sizeOptions = [],
  optionGroups,
  onSizeChange,
  onSelectionsChange,
}: CartItemCardProps) {
  const groups =
    optionGroups && optionGroups.length > 0
      ? optionGroups
      : sizeRequired
        ? [
            {
              id: "legacy",
              name: optionName,
              options: sizeOptions,
            },
          ]
        : [];
  const packLabel = formatProductPackLabel(product);
  const imageSrc = keytoUrl(product.featuredImage?.key);
  const imageAlt = product.featuredImage?.alt || product.name;

  const missingRequired = groups.some((group) => {
    const selected = String(selections?.[group.id] ?? selectedSize ?? "")
      .trim()
      .toUpperCase();
    if (selected) return false;
    return group.options.some((option) => option.value.length > 0);
  });

  return (
    <Card className="flex items-start gap-3 border-0 bg-transparent px-3 py-3 shadow-none md:items-center md:gap-6 md:px-5">
      <CardContent className="relative shrink-0 overflow-hidden p-0">
        <Link href={`/shop/${product.slug}`} className="block">
          <StorefrontImage
            src={imageSrc}
            alt={imageAlt}
            width={150}
            height={150}
            className="aspect-square h-[72px] w-[72px] rounded-md object-cover md:h-[120px] md:w-[120px]"
          />
        </Link>
      </CardContent>

      <CardHeader className="min-w-0 flex-1 space-y-2 p-0">
        <CardTitle className="text-sm font-semibold leading-snug md:text-base">
          <Link href={`/shop/${product.slug}`} className="hover:underline">
            {product.name}
          </Link>
        </CardTitle>
        {packLabel ? (
          <p className="text-xs text-muted-foreground">{packLabel}</p>
        ) : null}
        {groups.length > 0 ? (
          <div className="mt-1 space-y-2">
            {groups.map((group) => {
              const value = String(
                selections?.[group.id] ??
                  (groups.length === 1 ? selectedSize : "") ??
                  "",
              )
                .trim()
                .toUpperCase();
              const tileOptions = group.options.map((option) => {
                const rawLabel = String(option.label ?? option.value ?? "");
                const priceMatch = rawLabel.match(/₹\s*([\d,]+(?:\.\d+)?)/);
                const price = priceMatch
                  ? Number(priceMatch[1].replace(/,/g, ""))
                  : null;
                const label =
                  rawLabel.replace(/\s*[·•]\s*₹[\d,]+(?:\.\d+)?/g, "").trim() ||
                  option.value;
                return {
                  value: option.value,
                  label,
                  price: Number.isFinite(price) ? price : null,
                };
              });
              return (
                <ProductOptionTiles
                  key={group.id}
                  name={group.name}
                  compact
                  disabled={disabled || group.options.length === 0}
                  options={tileOptions}
                  value={value}
                  onChange={(nextValue) => {
                    if (onSelectionsChange) {
                      onSelectionsChange({
                        ...(selections ?? {}),
                        [group.id]: nextValue,
                      });
                    } else {
                      onSizeChange?.(nextValue);
                    }
                  }}
                />
              );
            })}
            {missingRequired ? (
              <p className="text-[11px] text-destructive">
                Please select every option to continue checkout.
              </p>
            ) : null}
          </div>
        ) : selectedSize ? (
          <p className="text-xs text-muted-foreground">
            {optionName}: {selectedSize}
          </p>
        ) : null}

        <QuantityInput
          value={quantity}
          addOneHandler={addOneHandler}
          minusOneHandler={minusOneHandler}
          disabled={disabled}
          className="h-9 max-w-[7.5rem] px-2 py-1 md:h-12 md:max-w-36 md:px-4"
        />
      </CardHeader>

      <CardFooter className="flex shrink-0 flex-col items-end gap-1 p-0 md:flex-row md:items-center md:gap-3">
        <ProductPriceDisplay
          product={product}
          layout="inline"
          className="text-sm md:text-base"
        />

        <Button
          aria-label="Remove Item Button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={removeHandler}
        >
          <Icons.close size={18} />
        </Button>
      </CardFooter>
    </Card>
  );
}

export default CartItemCard;
