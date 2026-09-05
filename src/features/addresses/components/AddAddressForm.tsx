"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import {
  mergeCheckoutAddressDefaults,
  saveCheckoutAddressDraft,
} from "../lib/checkoutAddressDraft";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import CheckoutTermsNotice from "@/components/layouts/CheckoutTermsNotice";
import { usePincodeLookup } from "../hooks/usePincodeLookup";
import {
  addressFormSchema,
  type AddressFormValues,
} from "../validations/addressFormSchema";

type Props = {
  onSubmit: (values: AddressFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
  submittingMessage?: string;
  defaultValues?: Partial<AddressFormValues>;
  /** Remember fields in localStorage until checkout completes (survives refresh). */
  persistDraft?: boolean;
  /** When the parent dialog opens, reload any saved draft. */
  dialogOpen?: boolean;
  checkoutQuantity?: number;
  disabled?: boolean;
};

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <span>
      {children}
      <span className="text-destructive" aria-hidden="true">
        {" "}
        *
      </span>
    </span>
  );
}

export function AddAddressForm({
  onSubmit,
  onCancel,
  submitLabel = "Add Address",
  submittingMessage = "Processing your details…",
  defaultValues,
  persistDraft = false,
  dialogOpen = true,
  disabled = false,
}: Props) {
  const initialValues = useMemo(
    () =>
      persistDraft
        ? mergeCheckoutAddressDefaults(defaultValues)
        : {
            fullName: "",
            email: "",
            mobile: "",
            line1: "",
            line2: "",
            city: "",
            state: "",
            postal_code: "",
            ...defaultValues,
          },
    [persistDraft, defaultValues],
  );

  const form = useForm<AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: initialValues,
  });

  const isSubmitting = form.formState.isSubmitting || disabled;
  const postalCode = form.watch("postal_code");
  const pincodeLookup = usePincodeLookup(postalCode);

  const wasDialogOpen = useRef(false);
  useEffect(() => {
    const justOpened = dialogOpen && !wasDialogOpen.current;
    wasDialogOpen.current = dialogOpen;

    if (!persistDraft || !justOpened) return;
    form.reset(mergeCheckoutAddressDefaults(defaultValues));
  }, [persistDraft, dialogOpen, defaultValues, form]);

  useEffect(() => {
    if (!persistDraft) return;

    const subscription = form.watch((values) => {
      saveCheckoutAddressDraft(values as AddressFormValues);
    });

    return () => subscription.unsubscribe();
  }, [form, persistDraft]);

  useEffect(() => {
    if (pincodeLookup.status !== "ready" || !pincodeLookup.result) return;
    const result = pincodeLookup.result;
    form.setValue("state", result.state, { shouldValidate: true });
    const currentCity = String(form.getValues("city") ?? "").trim();
    if (!currentCity) {
      form.setValue("city", result.city, { shouldValidate: true });
    }
  }, [form, pincodeLookup.result, pincodeLookup.status]);

  const localityLabel =
    pincodeLookup.status === "ready" && pincodeLookup.result
      ? [
          pincodeLookup.result.areas[0] || pincodeLookup.result.district,
          pincodeLookup.result.state,
        ]
          .filter(Boolean)
          .join(", ")
      : null;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-3 sm:space-y-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <RequiredLabel>Full Name</RequiredLabel>
              </FormLabel>
              <FormControl>
                <Input placeholder="Enter full name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="Enter email (optional)"
                  autoComplete="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="mobile"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <RequiredLabel>Mobile Number</RequiredLabel>
              </FormLabel>
              <FormControl>
                <Input
                  type="tel"
                  inputMode="numeric"
                  placeholder="Enter mobile number"
                  autoComplete="tel"
                  maxLength={10}
                  {...field}
                  onChange={(e) => {
                    const digits = e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 10);
                    field.onChange(digits);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="postal_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <RequiredLabel>PIN Code</RequiredLabel>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="6-digit PIN code"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={6}
                  {...field}
                  onChange={(e) => {
                    const digits = e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6);
                    field.onChange(digits);
                    if (digits.length < 6) {
                      form.setValue("state", "");
                    }
                  }}
                />
              </FormControl>
              {pincodeLookup.status === "loading" ? (
                <p className="text-xs text-muted-foreground">
                  Finding area and state…
                </p>
              ) : null}
              {localityLabel ? (
                <p className="text-xs text-muted-foreground">{localityLabel}</p>
              ) : null}
              {pincodeLookup.status === "error" && pincodeLookup.message ? (
                <p className="text-xs text-destructive">
                  {pincodeLookup.message}
                </p>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <RequiredLabel>City / Area</RequiredLabel>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Filled from PIN"
                    autoComplete="address-level2"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="state"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <RequiredLabel>State</RequiredLabel>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    readOnly
                    tabIndex={-1}
                    aria-readonly="true"
                    placeholder="Filled from PIN"
                    autoComplete="address-level1"
                    className="cursor-default bg-muted/50 text-muted-foreground pointer-events-none"
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">Filled from PIN</p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="line1"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <RequiredLabel>Address</RequiredLabel>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="House / street / landmark"
                  autoComplete="street-address"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <CheckoutTermsNotice />
        <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-2 sm:backdrop-blur-none sm:flex-row sm:justify-end sm:gap-3">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="w-full bg-[#E8A317] text-[#1a1a1a] hover:bg-[#d49210] sm:w-auto"
            disabled={
              isSubmitting ||
              (Boolean(postalCode) &&
                postalCode.length === 6 &&
                pincodeLookup.status !== "ready")
            }
          >
            {isSubmitting ? (
              <>
                {submittingMessage}
                <Spinner className="ml-2 h-4 w-4" aria-hidden="true" />
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default AddAddressForm;
