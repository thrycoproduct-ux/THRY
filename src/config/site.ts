import type { NavItemWithOptionalChildren } from "@/types";

export type SiteConfig = typeof siteConfig;

/** THRY — temporary local identity until production domain is set */
const ADDRESS_LINES = ["Address coming soon"] as const;

const CONTACTS = [
  {
    name: "THRY",
    phone: "",
    phoneHref: "",
  },
] as const;

const PHONE = CONTACTS[0].phone;
const PHONE_HREF = CONTACTS[0].phoneHref;
const EMAIL = "";
const GSTIN = "";

const SOCIAL = {
  instagram: "",
  youtube: "",
  facebook: "",
  whatsapp: "",
} as const;

export const siteConfig = {
  shopBoardName: "THRY",
  name: "THRY",
  shortName: "THRY",
  tagline: "Shop",
  location: "",
  description: "THRY — online shop.",
  searchPlaceholder: "Search products…",
  url: "http://localhost:3000",
  addressLines: ADDRESS_LINES,
  address: ADDRESS_LINES.join(", "),
  phone: PHONE,
  phoneHref: PHONE_HREF,
  contacts: CONTACTS,
  email: EMAIL,
  gstin: GSTIN,
  currency: "INR",
  currencySymbol: "₹",
  social: SOCIAL,
  announcements: [
    {
      text: "Welcome to THRY",
      href: "/shop",
      cta: "Shop now",
    },
  ],
  mainNav: [
    {
      title: "Collections",
      href: "/collections",
      description: "Browse collections.",
      items: [],
    },
    {
      title: "Featured",
      href: "/featured",
      description: "Featured products.",
      items: [],
    },
    {
      title: "Orders",
      href: "/orders",
      description: "Your orders.",
      items: [],
    },
  ] satisfies NavItemWithOptionalChildren[],

  footerNav: [
    {
      title: "Shop",
      items: [
        { title: "All products", href: "/shop", items: [] },
        { title: "Featured", href: "/featured", items: [] },
        { title: "All categories", href: "/collections", items: [] },
        { title: "Wishlist", href: "/wish-list", items: [] },
        { title: "Cart", href: "/cart", items: [] },
      ],
    },
    {
      title: "Explore",
      items: [
        { title: "Collections", href: "/collections", items: [] },
        { title: "Featured picks", href: "/featured", items: [] },
        { title: "Our story", href: "/about", items: [] },
        { title: "Contact", href: "/contact", items: [] },
      ],
    },
    {
      title: "Customer Service",
      items: [
        {
          title: "Terms & Conditions",
          href: "/terms-and-conditions",
          items: [],
        },
        { title: "Terms of Use", href: "/terms-of-use", items: [] },
        { title: "Privacy Policy", href: "/privacy-policy", items: [] },
        { title: "Shipping & Returns", href: "/shipping-returns", items: [] },
        { title: "Payment Methods", href: "/payment-methods", items: [] },
        { title: "FAQ", href: "/faq", items: [] },
        { title: "My orders", href: "/orders", items: [] },
      ],
    },
    {
      title: "About THRY",
      items: [
        { title: "Our Story", href: "/about", items: [] },
        { title: "Our Collections", href: "/collections", items: [] },
        { title: "Contact", href: "/contact", items: [] },
      ],
    },
  ] satisfies NavItemWithOptionalChildren[],
};
