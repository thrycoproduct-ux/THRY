import { siteConfig } from "@/config/site";
import { parseAddressLines } from "@/lib/admin/shop-contact";
import { INDIA_TIME_ZONE } from "@/lib/datetime/india";
import type { ShippingAddressFields } from "@/lib/orders/shipping-address-text";

export const PACKING_SLIP_BRAND = "THRY CO.";
export const PACKING_SLIP_THANKS = "Thank you for shopping with us!";

const STATE_ABBR: Record<string, string> = {
  "andhra pradesh": "AP",
  "arunachal pradesh": "AR",
  assam: "AS",
  bihar: "BR",
  chhattisgarh: "CG",
  goa: "GA",
  gujarat: "GJ",
  haryana: "HR",
  "himachal pradesh": "HP",
  jharkhand: "JH",
  karnataka: "KA",
  kerala: "KL",
  "madhya pradesh": "MP",
  maharashtra: "MH",
  manipur: "MN",
  meghalaya: "ML",
  mizoram: "MZ",
  nagaland: "NL",
  odisha: "OD",
  punjab: "PB",
  rajasthan: "RJ",
  sikkim: "SK",
  "tamil nadu": "TN",
  telangana: "TS",
  tripura: "TR",
  "uttar pradesh": "UP",
  uttarakhand: "UK",
  "west bengal": "WB",
  delhi: "DL",
  "new delhi": "DL",
  "andaman and nicobar islands": "AN",
  chandigarh: "CH",
  "jammu and kashmir": "JK",
  ladakh: "LA",
  puducherry: "PY",
};

export type PackingSlipItem = {
  name: string;
  quantity: number;
  imageUrl: string;
};

export type PackingSlipOrder = {
  id: string;
  createdAt: string;
  customerName: string | null;
  customerMobile: string | null;
  shippingAddress: ShippingAddressFields | null;
  items: PackingSlipItem[];
};

function abbreviateState(state: string | null | undefined): string {
  const raw = String(state ?? "").trim();
  if (!raw) return "";
  if (raw.length <= 3) return raw.toUpperCase();
  return STATE_ABBR[raw.toLowerCase()] ?? raw;
}

/** Qty on the slip: "1 of 1" like the printed THRY CO. reference. */
export function formatPackingSlipQuantity(quantity: number): string {
  const qty = Math.max(0, Math.round(Number(quantity) || 0));
  return `${qty} of ${qty}`;
}

/** e.g. "16 August 2026" */
export function formatPackingSlipDate(
  value: Date | string | number | null | undefined,
): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: INDIA_TIME_ZONE,
  }).format(date);
}

export function formatPackingSlipOrderHeading(orderId: string): string {
  const id = String(orderId ?? "").trim();
  if (!id) return "Order #";
  if (/^order\s*#/i.test(id)) return id;
  return `Order #${id}`;
}

/** SHIP TO / BILL TO body lines (name, street, pincode city ST, country). */
export function buildPackingSlipRecipientLines(order: {
  customerName: string | null;
  customerMobile?: string | null;
  shippingAddress: ShippingAddressFields | null;
  includePhone?: boolean;
}): string[] {
  const lines: string[] = [];
  const name = order.customerName?.trim() || "Customer";
  lines.push(name);

  const addr = order.shippingAddress;
  if (addr) {
    const line1 = addr.line1?.trim();
    const line2 = addr.line2?.trim();
    if (line1) lines.push(line1);
    if (line2) lines.push(line2);

    const pincode = addr.postalCode?.trim() || "";
    const city = addr.city?.trim() || "";
    const st = abbreviateState(addr.state);
    const locality = [pincode, city, st].filter(Boolean).join(" ");
    if (locality) lines.push(locality);

    const country = addr.country?.trim() || "India";
    lines.push(country);
  } else {
    lines.push("Address not available");
  }

  if (order.includePhone) {
    const phone = order.customerMobile?.trim();
    if (phone) lines.push(phone);
  }

  return lines;
}

/** Shop address for the packing-slip footer: admin setting, else code default. */
export function resolvePackingSlipShopAddressLines(
  adminSetting?: {
    isEnabled?: boolean;
    value?: { addressLines?: unknown } | null;
  } | null,
): string[] {
  const fallback = [...siteConfig.addressLines];
  if (!adminSetting?.isEnabled) return fallback;
  const parsed = parseAddressLines(adminSetting.value?.addressLines, fallback);
  if (parsed.some((line) => /coming soon/i.test(line))) return fallback;
  return parsed;
}

/**
 * Footer address like the printed sheet:
 * `Devi nagar hosur, No:1, 635109 Hosur TN, India`
 * Live shop data: street, then `pincode city ST`, then country.
 */
export function buildPackingSlipShopFooter(
  addressLines?: readonly string[] | null,
): {
  brand: string;
  address: string;
  mobile: string;
} {
  const lines =
    addressLines && addressLines.length > 0
      ? addressLines
      : siteConfig.addressLines;
  const [street = "", cityLine = "", stateLine = "", country = "India"] = lines;
  const pinMatch = cityLine.match(/(\d{6})/);
  const city = cityLine
    .replace(/[-,]?\s*\d{6}/, "")
    .replace(/^\d{6}\s*/, "")
    .replace(/[-,]/g, " ")
    .trim();
  const locality = [pinMatch?.[1] ?? "", city, abbreviateState(stateLine)]
    .filter(Boolean)
    .join(" ");
  const address = [street, locality, country].filter(Boolean).join(", ");
  return {
    brand: PACKING_SLIP_BRAND,
    address,
    mobile: siteConfig.phone ? `Mobile: ${siteConfig.phone}` : "",
  };
}
