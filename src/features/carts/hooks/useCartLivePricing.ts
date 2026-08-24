"use client";

import { resolveProductPricingForSelection } from "@/lib/products/pricing";
import { normalizeProductSizeConfig } from "@/lib/products/sizeConfig-shared";
import type { CartProductPricing } from "@/lib/storefront/cart-pricing";
import { extractProductIdFromCartLineKey } from "../cart-line";
import { useEffect, useMemo, useState } from "react";

type PricingMap = Record<string, CartProductPricing>;

export function useCartLivePricing(productIds: string[]) {
  const idsKey = useMemo(
    () => [...new Set(productIds.filter(Boolean))].sort().join(","),
    [productIds],
  );
  const [pricing, setPricing] = useState<PricingMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idsKey) {
      setPricing({});
      setError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadPricing() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/cart/pricing?ids=${encodeURIComponent(idsKey)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!res.ok) {
          throw new Error("Could not refresh cart prices.");
        }

        const payload = (await res.json()) as { pricing?: PricingMap };
        if (!cancelled) {
          setPricing(payload.pricing ?? {});
        }
      } catch (fetchError) {
        if (cancelled || controller.signal.aborted) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Could not refresh cart prices.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPricing();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [idsKey]);

  return { pricing, loading, error };
}

export function calcLiveCartSubtotal(
  quantities: Record<
    string,
    {
      quantity: number;
      /** If present, authoritative product id for this cart line. */
      productId?: string;
      size?: string;
      selections?: Record<string, string>;
    }
  >,
  pricing: PricingMap,
  sizeConfigs?: Record<string, unknown>,
): number {
  return Object.entries(quantities).reduce((total, [productId, item]) => {
    const resolvedProductId = extractProductIdFromCartLineKey(
      productId,
      item.productId,
    );
    const base = pricing[resolvedProductId];
    if (!base || item.quantity <= 0) return total;

    const sizeConfig = sizeConfigs?.[resolvedProductId]
      ? normalizeProductSizeConfig(sizeConfigs[resolvedProductId])
      : null;
    const unitPrice = sizeConfig?.enabled
      ? resolveProductPricingForSelection({
          product: {
            price: base.listPrice,
            discountEnabled: base.discountActive,
            discountPercent: base.discountPercent,
          },
          sizeConfig,
          selectedSize: item.size,
          selections: item.selections,
        }).unitPrice
      : base.unitPrice;

    if (!unitPrice) return total;
    return total + item.quantity * unitPrice;
  }, 0);
}
