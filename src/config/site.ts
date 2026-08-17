import type { NavItemWithOptionalChildren } from "@/types";

export type SiteConfig = typeof siteConfig;

/** THRY storefront */
const ADDRESS_LINES = [
  "355/1, Balaji Nagar Bedrapalii, Sipcot-1",
  "Hosur-635126",
  "Tamil Nadu",
  "India",
] as const;

const CONTACTS: readonly {
  name: string;
  phone: string;
  phoneHref: string;
}[] = [];
const EMAIL = "thrycoproduct@gmail.com";
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
  tagline: "Creative 3D printed products",
  location: "Hosur, Tamil Nadu",
  description:
    "THRY — creative 3D printed products, art & craft tools, customised gifts and home essentials.",
  searchPlaceholder: "Search products…",
  url: "https://thryco.com",
  addressLines: ADDRESS_LINES,
  address: ADDRESS_LINES.join(", "),
  phone: "",
  phoneHref: "",
  contacts: CONTACTS,
  email: EMAIL,
  gstin: GSTIN,
  currency: "INR",
  currencySymbol: "₹",
  social: SOCIAL,
  announcements: [
    {
      text: "Welcome to THRY — creative 3D printed products",
      href: "/shop",
      cta: "Shop now",
    },
    {
      text: "Art & craft tools · clay cutters · stamps · mandala kits",
      href: "/shop",
      cta: "Explore",
    },
    {
      text: "Customised gifts for every occasion",
      href: "/collections",
      cta: "Browse gifts",
    },
    {
      text: "3D printed statues · planters · toys & home essentials",
      href: "/shop",
      cta: "See more",
    },
    {
      text: "New drops & festive favourites — shop the collection",
      href: "/featured",
      cta: "Featured",
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
