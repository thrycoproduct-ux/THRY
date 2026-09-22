/** Shared order / shipping copy — short, plain words every buyer can follow. */

export const ORDER_SHIPPING = {
  title: "Order & shipping",
  /** Sidebar + page: main timings */
  processingLabel: "Processing time",
  processing: "2–3 days",
  processingNote: "Large orders may take a little longer.",
  deliveryLabel: "Delivery",
  regions: [
    {
      place: "Tamil Nadu",
      placeShort: "Tamil Nadu",
      time: "2–3 working days",
    },
    {
      place: "Other states in India",
      placeShort: "Other India",
      time: "5–6 working days",
    },
  ] as const,
  readyStock: "In-stock items usually ship sooner after we confirm.",
  tracking: "When we ship, you get an email with tracking.",
  contactPrompt: "No email in 10–15 working days? Contact us:",
  wholesale: "Wholesale: timing depends on order size.",
  fullDetailsHref: "/shipping-returns",
  fullDetailsLabel: "Full details",
  contactWhatsApp: "WhatsApp",
  contactEmail: "Email",
} as const;

export const ORDER_SHIPPING_FALLBACK = {
  email: "",
} as const;

/** Shared returns / replacement copy — keep every storefront surface in sync. */
export const ORDER_RETURNS = {
  windowDays: 7,
  summary:
    "Returns or exchanges may be accepted within 7 days of delivery for unused items with original packaging intact.",
  /** Short blurb for PDP accordion / trust strip */
  short:
    "Eligible unused items within 7 days. For replacement of damaged or wrong items, share a full unboxing video.",
  faqAnswer:
    "Unused items in original condition may be returned within 7 days. For a replacement (damage or wrong item), you must share a full unboxing video. Read Shipping & Returns and email us before sending anything back.",
  trustTitle: "Easy Replacement",
  trustDescription:
    "Share an unboxing video for damage or wrong-item replacements.",
  rules: [
    "Please email us before sending any item back.",
    "For replacement of a damaged, defective, or wrong item, you must share a clear unboxing video showing the sealed package being opened through to the product.",
    "Claims without a complete unboxing video may not be eligible for replacement.",
    "Customised, opened, or used craft kits cannot be returned.",
    "Shipping charges for returns may apply unless the item is faulty and approved for replacement.",
  ] as const,
  fullDetailsHref: "/shipping-returns",
} as const;

