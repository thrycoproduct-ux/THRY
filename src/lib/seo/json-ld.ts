import { siteConfig } from "@/config/site";
import { SEO_PRIMARY_NAV } from "@/lib/seo/constants";
import { getURL } from "@/lib/utils";

function siteOrigin() {
  return getURL().replace(/\/$/, "");
}

function absoluteUrl(path = "") {
  const origin = siteOrigin();
  if (!path) return origin;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalizedPath}`;
}

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name.replace("®", "").trim(),
    url: absoluteUrl(),
    logo: absoluteUrl("/images/thry-wordmark.svg"),
    email: siteConfig.email || undefined,
    telephone: siteConfig.phone || undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: siteConfig.addressLines[0],
      addressLocality: "Hosur",
      postalCode: "635126",
      addressRegion: "Tamil Nadu",
      addressCountry: "IN",
    },
    sameAs: Object.values(siteConfig.social).filter(Boolean),
  };
}

export function buildWebsiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name.replace("®", "").trim(),
    url: absoluteUrl(),
    description: siteConfig.description,
    inLanguage: "en-IN",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteUrl("/shop")}?search={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildStoreJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    name: siteConfig.name.replace("®", "").trim(),
    url: absoluteUrl(),
    image: absoluteUrl("/images/thry-wordmark.svg"),
    telephone: siteConfig.phone || undefined,
    email: siteConfig.email || undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: siteConfig.address,
      addressLocality: "Hosur",
      postalCode: "635126",
      addressRegion: "Tamil Nadu",
      addressCountry: "IN",
    },
    priceRange: "₹₹",
  };
}

export function buildSiteNavigationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "THRY primary navigation",
    itemListElement: SEO_PRIMARY_NAV.map((item, index) => ({
      "@type": "SiteNavigationElement",
      position: index + 1,
      name: item.name,
      description: item.description,
      url: absoluteUrl(item.href),
    })),
  };
}

export function buildBreadcrumbJsonLd(
  items: Array<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function buildProductJsonLd(input: {
  name: string;
  slug: string;
  description?: string | null;
  price: string | number;
  imageUrl?: string | null;
  inStock?: boolean;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description ?? `Buy ${input.name} from ${siteConfig.name}.`,
    image: input.imageUrl ? [input.imageUrl] : undefined,
    sku: input.slug,
    brand: {
      "@type": "Brand",
      name: siteConfig.name.replace("®", "").trim(),
    },
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/shop/${input.slug}`),
      priceCurrency: siteConfig.currency,
      price: Number(input.price),
      availability: input.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };
}
