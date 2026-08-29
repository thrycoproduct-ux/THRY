"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/use-toast";
import {
  createShippingAddress,
  getSavedShippingAddress,
  listUserAddresses,
} from "@/_actions/address";
import type { SavedShippingAddress } from "../validations/addressFormSchema";
import type { AddressFormValues } from "../validations/addressFormSchema";
import { AddAddressForm } from "./AddAddressForm";
import { AddressCard } from "./AddressCard";
import {
  isAddressCompleteForCheckout,
  pickDefaultAddressId,
  userAddressToFormValues,
} from "../lib/userAddress";
import type { UserAddressRecord } from "../lib/userAddress";
import type { CheckoutProgressUpdate } from "@/features/checkout/checkout-progress";
import { savingAddressProgress } from "@/features/checkout/checkout-progress";
import {
  formatCheckoutErrorMessage,
  isCheckoutPaymentCancelled,
} from "@/features/checkout/format-checkout-error";
import CheckoutTermsNotice from "@/components/layouts/CheckoutTermsNotice";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (shipping: SavedShippingAddress) => Promise<void>;
  guest: boolean;
  userId?: string | null;
  accountDefaults?: Partial<AddressFormValues>;
  submitLabel?: string;
  checkoutQuantity?: number;
  checkoutLocked?: boolean;
  onProgress?: (update: CheckoutProgressUpdate) => void;
  progressMessage?: string | null;
  onCheckoutError?: () => void;
};

type Step = "select" | "form";

export function CheckoutAddressDialog({
  open,
  onOpenChange,
  onComplete,
  guest,
  userId,
  accountDefaults,
  submitLabel = "Continue to payment",
  checkoutQuantity = 1,
  checkoutLocked = false,
  onProgress,
  progressMessage = null,
  onCheckoutError,
}: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("form");
  const [addresses, setAddresses] = useState<UserAddressRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedAddress = useMemo(
    () => addresses.find((item) => item.addressId === selectedId) ?? null,
    [addresses, selectedId],
  );

  const resetState = useCallback(() => {
    setStep(guest ? "form" : "select");
    setAddresses([]);
    setSelectedId(null);
    setLoadingAddresses(false);
    setIsSubmitting(false);
  }, [guest]);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }

    if (guest || !userId) {
      setStep("form");
      return;
    }

    let cancelled = false;
    setLoadingAddresses(true);

    listUserAddresses()
      .then((rows) => {
        if (cancelled) return;
        setAddresses(rows);
        if (rows.length > 0) {
          setStep("select");
          setSelectedId(pickDefaultAddressId(rows));
        } else {
          setStep("form");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        toast({
          title: "Could not load saved addresses",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
        setStep("form");
      })
      .finally(() => {
        if (!cancelled) setLoadingAddresses(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, guest, userId, resetState, toast]);

  const handleSavedAddressContinue = async () => {
    if (!selectedId || !selectedAddress) return;

    if (!isAddressCompleteForCheckout(selectedAddress)) {
      setStep("form");
      return;
    }

    setIsSubmitting(true);
    try {
      const shipping = await getSavedShippingAddress(selectedId);
      await onComplete(shipping);
    } catch (err) {
      onCheckoutError?.();
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
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (values: AddressFormValues) => {
    onProgress?.(savingAddressProgress());
    setIsSubmitting(true);
    try {
      const saved = await createShippingAddress(
        values,
        guest ? null : userId ?? null,
        { setAsDefault: !guest && addresses.length === 0 },
      );
      await onComplete(saved);
    } catch (err) {
      onCheckoutError?.();
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
      setIsSubmitting(false);
    }
  };

  const formDefaults = useMemo(() => {
    if (selectedAddress && step === "form") {
      return {
        ...accountDefaults,
        ...userAddressToFormValues(selectedAddress),
      };
    }
    return accountDefaults;
  }, [accountDefaults, selectedAddress, step]);

  const title =
    step === "select"
      ? "Select delivery address"
      : selectedAddress && !isAddressCompleteForCheckout(selectedAddress)
        ? "Complete your address"
        : "Add delivery address";

  const busy = isSubmitting || checkoutLocked;
  const activeProgressMessage =
    progressMessage ??
    (isSubmitting ? "Processing your details…" : submitLabel);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        hideCloseButton={busy}
        className="left-0 top-0 z-[190] flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[min(90dvh,860px)] sm:w-[min(92vw,780px)] sm:max-w-[780px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border"
      >
        <DialogHeader className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 text-left backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6 sm:py-4">
          <DialogTitle className="text-lg font-semibold sm:text-xl">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6 sm:py-4">
          {loadingAddresses ? (
            <div className="flex items-center justify-center py-16">
              <Spinner className="h-6 w-6 animate-spin" />
            </div>
          ) : step === "select" ? (
            <div className="space-y-4">
              <div className="space-y-3">
                {addresses.map((item) => (
                  <AddressCard
                    key={item.addressId}
                    address={item}
                    selectable
                    selected={item.addressId === selectedId}
                    onSelect={() => setSelectedId(item.addressId)}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSelectedId(null);
                  setStep("form");
                }}
              >
                + Add new address
              </Button>
            </div>
          ) : (
            <AddAddressForm
              onSubmit={handleFormSubmit}
              onCancel={() => {
                if (busy) return;
                if (addresses.length > 0) {
                  setStep("select");
                } else {
                  onOpenChange(false);
                }
              }}
              submitLabel={submitLabel}
              submittingMessage={activeProgressMessage}
              defaultValues={formDefaults}
              persistDraft
              dialogOpen={open}
              checkoutQuantity={checkoutQuantity}
              disabled={busy}
            />
          )}
        </div>

        {step === "select" ? (
          <div className="space-y-3 border-t bg-background px-4 py-3 sm:px-6">
            <CheckoutTermsNotice />
            <Button
              type="button"
              className="w-full"
              disabled={!selectedId || busy}
              onClick={handleSavedAddressContinue}
            >
              {busy ? (
                <>
                  {activeProgressMessage}
                  <Spinner
                    className="ml-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
