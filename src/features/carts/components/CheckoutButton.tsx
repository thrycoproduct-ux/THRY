"use client";

import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import type { CartItems } from "@/features/carts";
import { CheckoutAddressDialog } from "@/features/addresses";
import type { SavedShippingAddress } from "@/features/addresses";
import {
  clearCheckoutAddressDraft,
  saveCheckoutAddressDraft,
} from "@/features/addresses/lib/checkoutAddressDraft";
import type { AddressFormValues } from "@/features/addresses/validations/addressFormSchema";
import { clearClaimedOfferCode } from "@/features/offers/lib/welcomeOffer";
import {
  formatCheckoutErrorMessage,
  isCheckoutPaymentCancelled,
} from "@/features/checkout/format-checkout-error";
import { creatingOrderProgress } from "@/features/checkout/checkout-progress";
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
import { useCheckoutChrome } from "@/providers/CheckoutChromeProvider";
import { fetchWithTimeout } from "@/lib/network/fetchWithTimeout";

export const CART_DELIVERY_PINCODE_INPUT_ID = "cart-delivery-pincode";

type CheckoutButtonProps = React.ComponentProps<typeof Button> & {
  order: CartItems;
  guest: boolean;
  promoCode?: string | null;
  missingSizeProductNames?: string[];
  requireDeliveryStateSelection?: boolean;
  hasDeliveryStateSelected?: boolean;
  /** PIN / city / state already captured on the cart page for shipping. */
  cartAddressDefaults?: Partial<AddressFormValues>;
};

function focusCartDeliveryPincode() {
  const el = document.getElementById(CART_DELIVERY_PINCODE_INPUT_ID);
  if (!(el instanceof HTMLElement)) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (el instanceof HTMLInputElement) {
    window.setTimeout(() => el.focus(), 200);
  }
}

function focusFirstIncompleteCartLine() {
  const el = document.querySelector<HTMLElement>(
    "[data-cart-line-incomplete='true']",
  );
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}

function CheckoutButton({
  order,
  guest,
  promoCode,
  missingSizeProductNames = [],
  requireDeliveryStateSelection = false,
  hasDeliveryStateSelected = true,
  cartAddressDefaults,
  ...props
}: CheckoutButtonProps) {
  const { user } = useAuth();
  const bulkOrder = useBulkOrderGuardConfig();
  const { toast } = useToast();
  const { setHideStoreChrome } = useCheckoutChrome();
  const [open, setOpen] = useState(false);
  const [bulkGuardOpen, setBulkGuardOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { progress, isLocked, beginProgress, clearProgress, overlay } =
    useCheckoutProgress();

  useEffect(() => {
    preconnectRazorpayCheckout();
    preloadRazorpayCheckoutScript();
  }, []);

  useEffect(() => {
    setHideStoreChrome(open || isLocked || isLoading);
    return () => setHideStoreChrome(false);
  }, [open, isLocked, isLoading, setHideStoreChrome]);

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

  const pinBlocked =
    requireDeliveryStateSelection && !hasDeliveryStateSelected;
  const sizeBlocked = missingSizeProductNames.length > 0;

  const accountDefaults = useMemo(
    () => ({
      ...(user?.email
        ? {
            email: user.email,
            fullName:
              (user.user_metadata?.full_name as string | undefined) ?? "",
          }
        : {}),
      ...cartAddressDefaults,
    }),
    [cartAddressDefaults, user?.email, user?.user_metadata?.full_name],
  );

  const handleCheckoutComplete = async (shipping: SavedShippingAddress) => {
    setIsLoading(true);
    // Keep progress visible across dialog close so cart chrome does not flash.
    beginProgress(creatingOrderProgress());
    setOpen(false);
    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), 250);
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
      if (isCheckoutPaymentCancelled(err)) {
        toast({
          title: "Payment not completed",
          description: "You can try again when ready.",
        });
      } else {
        toast({
          title: "Checkout failed",
          description: formatCheckoutErrorMessage(err),
          variant: "destructive",
        });
      }
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
          if (pinBlocked) {
            focusCartDeliveryPincode();
            toast({
              title: "Enter delivery PIN",
              description:
                "Enter your 6-digit PIN in the cart summary to continue.",
            });
            return;
          }
          if (sizeBlocked) {
            focusFirstIncompleteCartLine();
            toast({
              title: "Select option in cart",
              description: `${missingSizeProductNames[0]}: please select an option before checkout.`,
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
            .map(([, item]) => item.productId)
            .filter((id): id is string => Boolean(id));
          if (uncheckedIds.length > 0) {
            const results = await Promise.all(
              uncheckedIds.map(async (productId) => {
                try {
                  const res = await fetchWithTimeout(
                    `/api/products/size-config?productId=${encodeURIComponent(productId)}`,
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
              focusFirstIncompleteCartLine();
              toast({
                title: "Select option in cart",
                description:
                  "Please select the required option for all products before checkout.",
              });
              return;
            }
          }
          if (hasBulkLineItem) {
            setBulkGuardOpen(true);
            return;
          }
          if (
            cartAddressDefaults &&
            Object.keys(cartAddressDefaults).length > 0
          ) {
            saveCheckoutAddressDraft(cartAddressDefaults);
          }
          setOpen(true);
        }}
        disabled={
          isLoading ||
          isLocked ||
          pinBlocked ||
          sizeBlocked ||
          Boolean(props.disabled)
        }
        title={
          pinBlocked
            ? "Enter your delivery PIN first"
            : sizeBlocked
              ? "Select required options first"
              : props.title
        }
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
