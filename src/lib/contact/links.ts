import {
  buildTelHref,
  buildWhatsAppHref,
  toInternationalPhoneDigits,
} from "@/lib/contact/phone";

/** Build a WhatsApp chat URL from a `tel:` href, display phone, or raw digits. */
export function whatsAppHrefFromPhone(phoneHref: string): string {
  return buildWhatsAppHref(phoneHref);
}

export type StoreContact = {
  name: string;
  phone: string;
  phoneHref: string;
};

/** Storefront mail link; null when email is missing or invalid. */
export function shopMailtoHref(
  email: string | null | undefined,
): string | null {
  const value = String(email ?? "").trim();
  if (!value || !value.includes("@") || value.includes(" ")) return null;
  return `mailto:${value}`;
}

export function contactActionHref(
  contact: StoreContact,
  mode: "call" | "whatsapp",
): string {
  const source = contact.phoneHref?.trim() || contact.phone?.trim() || "";
  if (mode === "call") {
    // Prefer normalized href even if stored phoneHref omitted country code.
    const digits = toInternationalPhoneDigits(source);
    return digits ? buildTelHref(digits) : contact.phoneHref || "tel:";
  }
  return buildWhatsAppHref(source);
}
