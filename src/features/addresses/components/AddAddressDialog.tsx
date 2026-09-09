"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { AddAddressForm } from "./AddAddressForm";
import {
  ADDRESS_DIALOG_CONTENT_CLASS,
  ADDRESS_DIALOG_HEADER_CLASS,
  ADDRESS_DIALOG_SCROLL_CLASS,
} from "./address-dialog-layout";
import type { AddressFormValues } from "../validations/addressFormSchema";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AddressFormValues) => Promise<void>;
  submitLabel?: string;
  defaultValues?: Partial<AddressFormValues>;
  persistDraft?: boolean;
  checkoutQuantity?: number;
  title?: string;
};

export function AddAddressDialog({
  open,
  onOpenChange,
  onSubmit,
  submitLabel,
  defaultValues,
  persistDraft = false,
  checkoutQuantity = 1,
  title = "Add New Address",
}: Props) {
  useKeyboardInset(open);
  const handleSubmit = async (values: AddressFormValues) => {
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch {
      /* Parent shows toast; keep dialog open for corrections */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={ADDRESS_DIALOG_CONTENT_CLASS}>
        <DialogHeader className={ADDRESS_DIALOG_HEADER_CLASS}>
          <DialogTitle className="text-lg font-semibold sm:text-xl">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className={ADDRESS_DIALOG_SCROLL_CLASS}>
          <AddAddressForm
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            submitLabel={submitLabel}
            defaultValues={defaultValues}
            persistDraft={persistDraft}
            dialogOpen={open}
            checkoutQuantity={checkoutQuantity}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AddAddressDialog;
