"use client";

import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import type { CartItems } from "@/features/carts";
import { CheckoutAddressDialog } from "@/features/addresses";
import type { SavedShippingAddress } from "@/features/addresses";
import { clearCheckoutAddressDraft } from "@/features/addresses/lib/checkoutAddressDraft";
import { clearClaimedOfferCode } from "@/features/offers/lib/welcomeOffer";
import { formatCheckoutErrorMessage } from "@/features/checkout/format-checkout-error";
import { startCheckout } from "@/features/checkout/startCheckout";
import {
  preconnectRazorpayCheckout,
  preloadRazorpayCheckoutScript,
} from "@/lib/payments/razorpay-checkout-client";
import { useCheckoutProgress } from "@/features/checkout/useCheckoutProgress";
import BulkOrderGuardDialog from "@/features/carts/components/BulkOrderGuardDialog";
import { isBulkOrderQuantity } from "@/features/carts/constants/bulkOrder";
import { useAuth } from "@/providers/AuthProvider";
import { useBulkOrderGuardConfig } from "@/providers/BulkOrderGuardProvider";
import { fetchWithTimeout } from "@/lib/network/fetchWithTimeout";

type CheckoutButtonProps = React.ComponentProps<typeof Button> & {
  order: CartItems;
  guest: boolean;
  promoCode?: string | null;
  missingSizeProductNames?: string[];
  requireDeliveryStateSelection?: boolean;
  hasDeliveryStateSelected?: boolean;
};

function CheckoutButton({
  order,
  guest,
  promoCode,
  missingSizeProductNames = [],
  requireDeliveryStateSelection = false,
  hasDeliveryStateSelected = true,
  ...props
}: CheckoutButtonProps) {
  const { user } = useAuth();
  const bulkOrder = useBulkOrderGuardConfig();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [bulkGuardOpen, setBulkGuardOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { progress, isLocked, beginProgress, clearProgress, overlay } =
    useCheckoutProgress();

  useEffect(() => {
    preconnectRazorpayCheckout();
    preloadRazorpayCheckoutScript();
  }, []);
  const hasBulkLineItem = useMemo(
    () =>
      bulkOrder.enabled &&
      Object.values(order).some((item) =>
        isBulkOrderQuantity(item.quantity, bulkOrder.threshold),
      ),
    [bulkOrder.enabled, bulkOrder.threshold, order],
  );
  const checkoutQuantity = useMemo(
    () => Object.values(order).reduce((sum, item) => sum + item.quantity, 0),
    [order],
  );

  const accountDefaults = useMemo(
    () =>
      user?.email
        ? {
            email: user.email,
            fullName:
              (user.user_metadata?.full_name as string | undefined) ?? "",
          }
        : undefined,
    [user?.email, user?.user_metadata?.full_name],
  );

  const handleCheckoutComplete = async (shipping: SavedShippingAddress) => {
    setOpen(false);
    setIsLoading(true);
    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), 500);
    });
    try {
      await startCheckout({
        order,
        guest,
        shipping,
        promoCode: promoCode ?? null,
        onProgress: beginProgress,
      });
      clearCheckoutAddressDraft();
      if (promoCode) clearClaimedOfferCode();
    } catch (err) {
      clearProgress();
      toast({
        title: "Checkout failed",
        description: formatCheckoutErrorMessage(err),
        variant: "destructive",
      });
      // Handled via toast — do not rethrow (avoids Sentry unhandledrejection noise).
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {overlay}

      <Button
        {...props}
        className={cn("w-full", props.className)}
        onClick={async () => {
          if (isLocked) return;
          if (requireDeliveryStateSelection && !hasDeliveryStateSelected) {
            toast({
              title: "Enter delivery PIN",
              description:
                "Please enter your 6-digit PIN code in cart summary before checkout.",
              variant: "destructive",
            });
            return;
          }
          if (missingSizeProductNames.length > 0) {
            toast({
              title: "Select option in cart",
              description: `${missingSizeProductNames[0]}: please select an option before checkout.`,
              variant: "destructive",
            });
            return;
          }
          const uncheckedIds = Object.entries(order)
            .filter(
              ([, item]) =>
                !String(item.size ?? "")
                  .trim()
                  .toUpperCase(),
            )
            .map(([productId]) => productId);
          if (uncheckedIds.length > 0) {
            const results = await Promise.all(
              uncheckedIds.map(async (productId) => {
                try {
                  const res = await fetchWithTimeout(
                    `/api/products/size-config?productId=${encodeURIComponent(productId)}`,
                    { cache: "no-store" },
                  );
                  if (!res.ok) return { productId, required: false };
                  const payload = (await res.json()) as { enabled?: boolean };
                  return { productId, required: Boolean(payload.enabled) };
                } catch {
                  return { productId, required: false };
                }
              }),
            );
            const requiredMissing = results.find((result) => result.required);
            if (requiredMissing) {
              toast({
                title: "Select option in cart",
                description:
                  "Please select the required option for all products before checkout.",
                variant: "destructive",
              });
              return;
            }
          }
          if (hasBulkLineItem) {
            setBulkGuardOpen(true);
            return;
          }
          setOpen(true);
        }}
        disabled={isLoading || isLocked || props.disabled}
      >
        {isLoading || isLocked ? "Processing…" : "Check out"}
        {(isLoading || isLocked) && (
          <Spinner className="ml-3 h-4 w-4 animate-spin" aria-hidden="true" />
        )}
      </Button>

      <CheckoutAddressDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
        }}
        onComplete={handleCheckoutComplete}
        guest={guest}
        userId={user?.id}
        accountDefaults={accountDefaults}
        submitLabel="Continue to payment"
        checkoutQuantity={checkoutQuantity}
        checkoutLocked={isLocked}
        onProgress={beginProgress}
        progressMessage={progress?.message ?? null}
        onCheckoutError={clearProgress}
      />

      <BulkOrderGuardDialog
        open={bulkGuardOpen}
        onOpenChange={setBulkGuardOpen}
      />
    </>
  );
}

export default CheckoutButton;
