import InfoPage from "@/components/layouts/InfoPage";
import Link from "next/link";
import { Metadata } from "next";
import { siteConfig } from "@/config/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Our Story | ${siteConfig.name}`,
  description: `About ${siteConfig.name} — creative 3D printed products from Hosur, Tamil Nadu.`,
};

export default function AboutPage() {
  return (
    <InfoPage
      heading="Our Story"
      description={`${siteConfig.name} — ${siteConfig.tagline}.`}
    >
      <p>
        {siteConfig.name} makes creative 3D printed products, art &amp; craft
        tools, customised gifts, and home essentials.
      </p>
      <p>
        Based in Hosur, Tamil Nadu. Visit us at {siteConfig.address}, or call{" "}
        <a href={siteConfig.phoneHref} className="text-primary hover:underline">
          {siteConfig.phone}
        </a>
        .
      </p>
      <p>
        Browse our{" "}
        <Link href="/collections" className="text-primary hover:underline">
          collections
        </Link>
        , explore{" "}
        <Link href="/featured" className="text-primary hover:underline">
          featured products
        </Link>
        , or{" "}
        <Link href="/contact" className="text-primary hover:underline">
          get in touch
        </Link>{" "}
        for orders and enquiries.
      </p>
    </InfoPage>
  );
}
