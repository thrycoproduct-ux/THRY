"use client";

import { useAuth } from "@/providers/AuthProvider";
import { useBulkOrderGuardConfig } from "@/providers/BulkOrderGuardProvider";
import { useStockControlConfig } from "@/providers/StockControlProvider";
import { useToast } from "@/components/ui/use-toast";
import { Suspense, useState } from "react";

import { Icons } from "@/components/layouts/icons";
import { Button, ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import BulkOrderGuardDialog from "./BulkOrderGuardDialog";
import { isBulkOrderQuantity } from "../constants/bulkOrder";
import useCartActions from "../hooks/useCartActions";
import { sizePreviewToCartConfig } from "../cart-options-guard";
import type { ProductSizePreview } from "@/lib/products/sizeConfig-shared";

interface AddToCartButtonProps extends ButtonProps {
  productId: string;
  quantity?: number;
  cartId?: string;
  stock?: number | null;
  /** Batched listing preview — skips per-click size-config fetch when set. */
  sizePreview?: ProductSizePreview | null;
  /** Selected variant value when `sizePreview.canPickOnListing`. */
  selectedVariant?: string;
}

function AddToCartButton({
  productId,
  quantity = 1,
  stock,
  sizePreview,
  selectedVariant,
  disabled,
  className,
}: AddToCartButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const bulkOrder = useBulkOrderGuardConfig();
  const stockControl = useStockControlConfig();
  const { addProductToCart } = useCartActions(user, productId, stock ?? null);
  const [bulkGuardOpen, setBulkGuardOpen] = useState(false);
  const isOutOfStock =
    stockControl.enabled && typeof stock === "number" && stock <= 0;

  return (
    <Suspense>
      <Button
        type="button"
        aria-label="Add to cart"
        className={cn(
          "relative z-10 rounded-full p-0 min-h-11 min-w-11 h-11 w-11",
          className,
        )}
        disabled={disabled || isOutOfStock}
        onClick={async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (isOutOfStock) return;

          let addOpts:
            | { selections: Record<string, string>; size: string }
            | undefined;

          if (sizePreview?.canPickOnListing) {
            const selected = String(selectedVariant ?? "")
              .trim()
              .toUpperCase();
            if (!selected) {
              const optionName =
                String(sizePreview.optionName ?? "").trim() || "option";
              toast({
                title: `Choose ${optionName} first`,
                description: `Tap a ${optionName.toLowerCase()} above, then add to cart.`,
              });
              return;
            }
            addOpts = {
              selections: { [sizePreview.groupId]: selected },
              size: selected,
            };
          } else if (sizePreview?.enabled && !sizePreview.canPickOnListing) {
            toast({
              title: "Select options first",
              description:
                "This product has multiple options. Open the product page to choose.",
            });
            return;
          } else if (!sizePreview) {
            const sizeConfigRes = await fetch(
              `/api/products/size-config?productId=${encodeURIComponent(productId)}`,
            );
            if (sizeConfigRes.ok) {
              const sizeConfig = (await sizeConfigRes.json()) as {
                enabled?: boolean;
                name?: string;
              };
              if (sizeConfig.enabled) {
                const optionName =
                  String(sizeConfig.name ?? "").trim() || "option";
                toast({
                  title: `Select ${optionName} first`,
                  description: `This product has ${optionName.toLowerCase()} options. Open the product page and choose before adding to cart.`,
                });
                return;
              }
            }
          }

          if (
            bulkOrder.enabled &&
            isBulkOrderQuantity(quantity, bulkOrder.threshold)
          ) {
            setBulkGuardOpen(true);
            return;
          }
          const res = await addProductToCart(quantity, {
            ...(addOpts ?? {}),
            ...(sizePreview != null
              ? { sizeConfigHint: sizePreviewToCartConfig(sizePreview) }
              : {}),
          });
          if (res?.blockedBulk) {
            setBulkGuardOpen(true);
          }
        }}
      >
        <Icons.basket className="h-5 w-5 md:h-4 md:w-4" />
      </Button>
      <BulkOrderGuardDialog
        open={bulkGuardOpen}
        onOpenChange={setBulkGuardOpen}
      />
    </Suspense>
  );
}

export default AddToCartButton;
