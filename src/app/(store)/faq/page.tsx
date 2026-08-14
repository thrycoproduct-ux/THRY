import InfoPage from "@/components/layouts/InfoPage";
import { resolveStorefrontContact } from "@/lib/integrations/settings";
import Link from "next/link";
import { Metadata } from "next";
import { siteConfig } from "@/config/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `FAQ | ${siteConfig.name}`,
  description: `Frequently asked questions about ${siteConfig.name} craft supplies`,
};

const faqs = [
  {
    q: "Do you sell wholesale?",
    a: "Yes. We offer wholesale and bulk pricing for retailers and makers. Message us on Instagram with your requirements.",
  },
  {
    q: "How do I track my order?",
    a: "After checkout you will receive confirmation. Log in and visit My Orders, or contact us with your order number for an update.",
  },
  {
    q: "Can I visit your store?",
    a: "Yes. We are in Balaji Nagar, Sipcot-1, Hosur. See our Contact page for the full address.",
  },
  {
    q: "What do you sell?",
    a: "Terracotta raw materials and art & craft supplies. Each product listing describes materials and usage. Ask us if you need help choosing.",
  },
  {
    q: "How do returns work?",
    a: "Unused items in original condition may be returned within 7 days. Please read our Shipping & Returns page and contact us before sending anything back.",
  },
];

export default async function FaqPage() {
  const contact = await resolveStorefrontContact();

  return (
    <InfoPage
      heading="FAQ"
      description={`Answers to common questions about shopping with ${siteConfig.name}.`}
    >
      <dl className="space-y-6">
        {faqs.map((item) => (
          <div key={item.q} className="space-y-1.5">
            <dt className="font-semibold text-foreground">{item.q}</dt>
            <dd className="text-muted-foreground">{item.a}</dd>
          </div>
        ))}
      </dl>
      <p className="pt-2 text-muted-foreground">
        Still need help?{" "}
        <Link href="/contact" className="text-primary hover:underline">
          Contact us
        </Link>
        {contact.address ? ` · ${contact.address}` : null}
      </p>
    </InfoPage>
  );
}
