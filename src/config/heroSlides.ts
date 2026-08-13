import { siteConfig } from "@/config/site";

export type HeroSlide = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  cta: string;
  image: string;
  imageAlt: string;
};

/** Homepage hero fallback until Admin → Home Banner uploads product photos. */
export const heroSlides: HeroSlide[] = [
  {
    id: "craft",
    title: "Art & craft tools",
    subtitle: "Clay cutters, stamps, mandala tools and more",
    href: "/shop",
    cta: "Shop now",
    image: "/images/thry-hero-craft.svg",
    imageAlt: `${siteConfig.name} — art and craft tools`,
  },
  {
    id: "gifts",
    title: "Customised gifts",
    subtitle: "Thoughtful 3D-printed gifts for every occasion",
    href: "/collections",
    cta: "Explore",
    image: "/images/thry-hero-gifts.svg",
    imageAlt: `${siteConfig.name} — customised gifts`,
  },
  {
    id: "statues",
    title: "3D printed creations",
    subtitle: "Statues, planters, toys and home essentials",
    href: "/shop",
    cta: "Browse all",
    image: "/images/thry-hero-statues.svg",
    imageAlt: `${siteConfig.name} — 3D printed creations`,
  },
];
