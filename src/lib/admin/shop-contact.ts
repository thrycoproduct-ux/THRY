import type { StoreContact } from "@/lib/contact/links";
import { buildTelHref } from "@/lib/contact/phone";

export type ShopContactPersonInput = {
  name: string;
  phone: string;
};

export type ShopContactPayload = {
  addressLines: string[];
  gstin: string;
  email: string;
  contacts: ShopContactPersonInput[];
};

export type ResolvedShopContact = {
  addressLines: readonly string[];
  address: string;
  gstin: string;
  email: string;
  contacts: readonly StoreContact[];
  phone: string;
  phoneHref: string;
};

export function buildPhoneHref(phone: string): string {
  return buildTelHref(phone);
}

export function normalizeShopContacts(
  raw: ShopContactPersonInput[],
): StoreContact[] {
  const result: StoreContact[] = [];

  for (const item of raw) {
    const name = item.name.trim();
    const phone = item.phone.trim();
    if (!name || !phone) continue;

    result.push({
      name,
      phone,
      phoneHref: buildPhoneHref(phone),
    });
  }

  return result;
}

export function parseAddressLines(
  value: unknown,
  fallback: readonly string[],
): string[] {
  if (Array.isArray(value)) {
    const lines = value.map((line) => String(line).trim()).filter(Boolean);
    if (lines.length > 0) return lines;
  }

  if (typeof value === "string") {
    const lines = value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 0) return lines;
  }

  return [...fallback];
}

export function resolveShopContact(
  defaults: ResolvedShopContact,
  admin: Partial<ShopContactPayload> | null | undefined,
  enabled: boolean,
): ResolvedShopContact {
  if (!admin || !enabled) return defaults;

  const parsedAddress = admin.addressLines?.length
    ? parseAddressLines(admin.addressLines, defaults.addressLines)
    : defaults.addressLines;
  const addressLines = parsedAddress.some((line) => /coming soon/i.test(line))
    ? defaults.addressLines
    : parsedAddress;

  const contacts = admin.contacts?.length
    ? normalizeShopContacts(admin.contacts)
    : [...defaults.contacts];

  const resolvedContacts = contacts.length ? contacts : [...defaults.contacts];
  const primary = resolvedContacts[0] ?? defaults.contacts[0];

  const gstin = String(admin.gstin ?? "").trim() || defaults.gstin;
  const email = String(admin.email ?? "").trim() || defaults.email;

  return hideShopPhoneOnStorefront({
    addressLines,
    address: addressLines.join(", "),
    gstin,
    email,
    contacts: resolvedContacts,
    phone: primary?.phone ?? defaults.phone,
    phoneHref: primary?.phoneHref ?? defaults.phoneHref,
  });
}

/** Shop phone/WhatsApp stay off the public site even if admin still has numbers saved. */
export function hideShopPhoneOnStorefront(
  contact: ResolvedShopContact,
): ResolvedShopContact {
  return {
    ...contact,
    phone: "",
    phoneHref: "",
    contacts: [],
  };
}
