/** High-value storefront pages Google may use as sitelinks. */
export const SEO_STATIC_PAGES = [
  {
    path: "/",
    changeFrequency: "daily" as const,
    priority: 1,
  },
  {
    path: "/shop",
    changeFrequency: "daily" as const,
    priority: 0.95,
  },
  {
    path: "/featured",
    changeFrequency: "daily" as const,
    priority: 0.9,
  },
  {
    path: "/collections",
    changeFrequency: "weekly" as const,
    priority: 0.9,
  },
  {
    path: "/about",
    changeFrequency: "monthly" as const,
    priority: 0.6,
  },
  {
    path: "/contact",
    changeFrequency: "monthly" as const,
    priority: 0.7,
  },
  {
    path: "/faq",
    changeFrequency: "monthly" as const,
    priority: 0.5,
  },
  {
    path: "/shipping-returns",
    changeFrequency: "monthly" as const,
    priority: 0.5,
  },
  {
    path: "/terms-and-conditions",
    changeFrequency: "monthly" as const,
    priority: 0.6,
  },
  {
    path: "/terms-of-use",
    changeFrequency: "monthly" as const,
    priority: 0.55,
  },
  {
    path: "/privacy-policy",
    changeFrequency: "monthly" as const,
    priority: 0.55,
  },
  {
    path: "/store-policy",
    changeFrequency: "monthly" as const,
    priority: 0.5,
  },
  {
    path: "/payment-methods",
    changeFrequency: "monthly" as const,
    priority: 0.5,
  },
];

/** Primary nav targets surfaced for crawlers and internal linking. */
export const SEO_PRIMARY_NAV = [
  {
    name: "Shop all products",
    href: "/shop",
    description: "Browse terracotta and art & craft supplies online.",
  },
  {
    name: "Featured products",
    href: "/featured",
    description: "Handpicked craft supplies and materials.",
  },
  {
    name: "All collections",
    href: "/collections",
    description: "Explore craft collections and categories.",
  },
  {
    name: "Contact us",
    href: "/contact",
    description: "Visit our Hosur store or message us for orders.",
  },
  {
    name: "Terms & Conditions",
    href: "/terms-and-conditions",
    description: "Terms of use, orders, payments, and store policies.",
  },
] as const;
