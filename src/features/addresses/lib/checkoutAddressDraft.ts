import {
  addressFormSchema,
  type AddressFormValues,
} from "../validations/addressFormSchema";

const STORAGE_KEY = "sakthi_checkout_address_draft";

const emptyDraft = (): AddressFormValues => ({
  fullName: "",
  email: "",
  mobile: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal_code: "",
});

export function loadCheckoutAddressDraft(): Partial<AddressFormValues> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    const result = addressFormSchema.partial().safeParse(parsed);
    if (!result.success) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return result.data;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveCheckoutAddressDraft(values: Partial<AddressFormValues>) {
  if (typeof window === "undefined") return;

  try {
    const payload = { ...emptyDraft(), ...values };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function clearCheckoutAddressDraft() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

export function mergeCheckoutAddressDefaults(
  accountDefaults?: Partial<AddressFormValues>,
): AddressFormValues {
  const base = emptyDraft();
  const draft = loadCheckoutAddressDraft();
  return {
    ...base,
    ...accountDefaults,
    ...draft,
  };
}

/** Prefill checkout address from the cart PIN the shopper already entered. */
export function buildCartPincodeDefaults(input: {
  postal_code?: string;
  city?: string;
  state?: string;
}): Partial<AddressFormValues> {
  const postal_code = String(input.postal_code ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);
  if (postal_code.length !== 6) return {};

  const out: Partial<AddressFormValues> = { postal_code };
  const city = String(input.city ?? "").trim();
  const state = String(input.state ?? "").trim();
  if (city) out.city = city;
  if (state) out.state = state;
  return out;
}
