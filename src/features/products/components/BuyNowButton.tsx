"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/use-toast";
import { CheckoutAddressDialog } from "@/features/addresses";
import type { SavedShippingAddress } from "@/features/addresses";
import { clearCheckoutAddressDraft } from "@/features/addresses/lib/checkoutAddressDraft";
import { startCheckout } from "@/features/checkout/startCheckout";
import {
  preconnectRazorpayCheckout,
  preloadRazorpayCheckoutScript,
} from "@/lib/payments/razorpay-checkout-client";
import { useCheckoutProgress } from "@/features/checkout/useCheckoutProgress";
import { useAuth } from "@/providers/AuthProvider";
import { useStockControlConfig } from "@/providers/StockControlProvider";

type BuyNowButtonProps = {
  productId: string;
  quantity?: number;
  stock?: number | null;
};

function BuyNowButton({ productId, quantity = 1, stock }: BuyNowButtonProps) {
  const { user } = useAuth();
  const stockControl = useStockControlConfig();
  const { toast } = useToast();
  const isOutOfStock =
    stockControl.enabled && typeof stock === "number" && stock <= 0;

  const [open, setOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { progress, isLocked, beginProgress, clearProgress, overlay } =
    useCheckoutProgress();

  useEffect(() => {
    preconnectRazorpayCheckout();
    preloadRazorpayCheckoutScript();
  }, []);

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
    setIsProcessing(true);
    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), 500);
    });
    try {
      await startCheckout({
        order: { [productId]: { quantity } },
        guest: !user,
        shipping,
        onProgress: beginProgress,
      });
      clearCheckoutAddressDraft();
    } catch (err) {
      clearProgress();
      toast({
        title: "Could not complete purchase",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  const busy = isProcessing || isLocked;

  return (
    <>
      {overlay}

      <Button
        type="button"
        disabled={busy || isOutOfStock}
        onClick={() => {
          if (isLocked) return;
          setOpen(true);
        }}
      >
        {isOutOfStock ? (
          "Out of Stock"
        ) : busy ? (
          <>
            Processing…
            <Spinner className="ml-2 h-4 w-4 animate-spin" aria-hidden="true" />
          </>
        ) : (
          "Buy Now"
        )}
      </Button>

      <CheckoutAddressDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
        }}
        onComplete={handleCheckoutComplete}
        guest={!user}
        userId={user?.id}
        accountDefaults={accountDefaults}
        submitLabel="Continue to payment"
        checkoutQuantity={quantity}
        checkoutLocked={isLocked}
        onProgress={beginProgress}
        progressMessage={progress?.message ?? null}
        onCheckoutError={clearProgress}
      />
    </>
  );
}

export default BuyNowButton;
