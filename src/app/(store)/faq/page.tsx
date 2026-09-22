import InfoPage from "@/components/layouts/InfoPage";
import { resolveStorefrontContact } from "@/lib/integrations/settings";
import { ORDER_RETURNS } from "@/lib/storefront/order-shipping";
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
    q: "Can I visit your unit?",
    a: "No. Our Hosur location is a manufacturing unit and is not open for customer visits. Please shop online or contact us by email.",
  },
  {
    q: "What do you sell?",
    a: "Terracotta raw materials and art & craft supplies. Each product listing describes materials and usage. Ask us if you need help choosing.",
  },
  {
    q: "How do returns work?",
    a: ORDER_RETURNS.faqAnswer,
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
