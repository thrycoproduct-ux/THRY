"use client";

import { cn, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CourierChargeBreakdown } from "@/lib/courier/calculate";
import { shouldShowCartDiscountRows } from "@/features/carts/lib/cart-order-summary-display";

export type CartOrderSummaryFieldsProps = {
  productCount: number;
  courierEnabled: boolean;
  offerCodesEnabled: boolean;
  deliveryPincode: string;
  onPincodeChange: (pincode: string) => void;
  pincodeStatus: "idle" | "loading" | "ready" | "error";
  pincodeLocalityLabel: string | null;
  pincodeError: string | null;
  pricingReady: boolean;
  promoInput: string;
  onPromoInputChange: (value: string) => void;
  onApplyPromo: () => void;
  appliedPromoCode: string | null;
  promoPercentage: number;
  onRemovePromo: () => void;
  subtotal: number;
  discountAmount: number;
  discountedSubtotal: number;
  courierBreakdown: CourierChargeBreakdown | null;
  gstEnabled: boolean;
  gstPercentage: number;
  gstAmount: number;
  totalAmount: number;
};

/** PIN-first delivery + price breakdown (hidden until PIN resolves). */
export function CartOrderSummaryFields({
  courierEnabled,
  offerCodesEnabled,
  deliveryPincode,
  onPincodeChange,
  pincodeStatus,
  pincodeLocalityLabel,
  pincodeError,
  pricingReady,
  promoInput,
  onPromoInputChange,
  onApplyPromo,
  appliedPromoCode,
  promoPercentage,
  onRemovePromo,
  subtotal,
  discountAmount,
  discountedSubtotal,
  courierBreakdown,
  totalAmount,
}: CartOrderSummaryFieldsProps) {
  const showDiscountRows = shouldShowCartDiscountRows({
    discountAmount,
    promoPercentage,
  });

  return (
    <>
      {courierEnabled ? (
        <div className="mb-4">
          <label className="mb-2 block text-xs font-medium text-muted-foreground">
            Delivery PIN code
          </label>
          <Input
            id="cart-delivery-pincode"
            value={deliveryPincode}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            placeholder="Enter 6-digit PIN"
            aria-invalid={
              pincodeStatus === "error" ||
              (deliveryPincode.length === 6 && pincodeStatus !== "ready")
            }
            className={cn(
              "h-10",
              (pincodeStatus === "error" ||
                (deliveryPincode.length > 0 &&
                  deliveryPincode.length < 6 &&
                  pincodeStatus !== "loading")) &&
                "border-destructive ring-1 ring-destructive/30",
            )}
            onChange={(event) =>
              onPincodeChange(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
          />
          {pincodeStatus === "loading" ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Finding area and state…
            </p>
          ) : null}
          {pincodeStatus === "ready" && pincodeLocalityLabel ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {pincodeLocalityLabel}
            </p>
          ) : null}
          {pincodeStatus === "error" && pincodeError ? (
            <p className="mt-1.5 text-xs text-destructive">{pincodeError}</p>
          ) : null}
          {!pricingReady && pincodeStatus !== "error" ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Enter your PIN to see delivery charges and total.
            </p>
          ) : null}
        </div>
      ) : null}

      {offerCodesEnabled ? (
        <>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">
            Promo code
          </label>
          <div className="mb-4 flex items-center gap-2">
            <Input
              value={promoInput}
              onChange={(event) =>
                onPromoInputChange(
                  event.target.value.toUpperCase().replace(/\s+/g, ""),
                )
              }
              placeholder="ENTER CODE"
              className="h-9"
            />
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={onApplyPromo}
            >
              Apply
            </Button>
          </div>
          {appliedPromoCode ? (
            <div className="mb-3 flex items-center justify-between rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
              <span>
                {appliedPromoCode} ({promoPercentage}%)
              </span>
              <button type="button" onClick={onRemovePromo}>
                Remove
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {pricingReady ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {showDiscountRows ? (
            <>
              <div className="flex items-center justify-between">
                <span>
                  Discount
                  {promoPercentage > 0 ? ` (${promoPercentage}%)` : ""}
                </span>
                <span>{`- ${formatPrice(discountAmount)}`}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Subtotal after discount</span>
                <span>{formatPrice(discountedSubtotal)}</span>
              </div>
            </>
          ) : null}
          {courierEnabled ? (
            <div className="flex items-center justify-between">
              <span>Courier</span>
              <span>
                {courierBreakdown?.ruleApplied === "free_shipping"
                  ? "Free"
                  : courierBreakdown
                    ? formatPrice(courierBreakdown.charge)
                    : formatPrice(0)}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t pt-2 font-semibold">
            <span>Total</span>
            <span>{formatPrice(totalAmount)}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
