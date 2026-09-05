import type { AddressFormValues } from "../validations/addressFormSchema";

export type UserAddressRecord = {
  addressId: string;
  fullName: string;
  email: string;
  mobile: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  isDefault: boolean;
  createdAt: string;
};

export function userAddressToFormValues(
  record: UserAddressRecord,
): AddressFormValues {
  return {
    fullName: record.fullName,
    email: record.email,
    mobile: record.mobile,
    line1: record.line1,
    line2: record.line2,
    city: record.city,
    state: record.state,
    postal_code: record.postal_code,
  };
}

export function isAddressCompleteForCheckout(record: UserAddressRecord) {
  return Boolean(
    record.fullName.trim() &&
      record.mobile.trim() &&
      record.line1.trim() &&
      record.city.trim() &&
      record.state.trim() &&
      record.postal_code.trim(),
  );
}

export function formatAddressLines(record: UserAddressRecord) {
  const parts = [
    record.line1,
    record.line2,
    `${record.city}, ${record.state} ${record.postal_code}`,
  ].filter(Boolean);
  return parts;
}

export function pickDefaultAddressId(addresses: UserAddressRecord[]) {
  const defaultAddress = addresses.find((item) => item.isDefault);
  return defaultAddress?.addressId ?? addresses[0]?.addressId ?? null;
}
