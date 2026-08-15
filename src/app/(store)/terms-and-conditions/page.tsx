import InfoPage from "@/components/layouts/InfoPage";
import { siteConfig } from "@/config/site";
import { resolveStorefrontContact } from "@/lib/integrations/settings";
import { STOREFRONT_STATIC_REVALIDATE_SECONDS } from "@/lib/cache/constants";
import Link from "next/link";
import { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Terms & Conditions | THRY",
  description:
    "Terms and Conditions and Terms of Use for shopping at THRY.",
  alternates: {
    canonical: "/terms-and-conditions",
  },
};

export default async function TermsAndConditionsPage() {
  const contact = await resolveStorefrontContact();
  const businessName = siteConfig.name.replace("®", "").trim();
  const lastUpdated = "7 July 2026";

  return (
    <InfoPage
      heading="Terms & Conditions"
      description={`Please read these terms carefully before using ${businessName} website or placing an order.`}
    >
      <p className="text-xs text-muted-foreground">
        Last updated: {lastUpdated}
      </p>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          1. Introduction
        </h2>
        <p>
          These Terms &amp; Conditions (&quot;Terms&quot;) govern your access to
          and use of the website{" "}
          <Link href="/" className="text-primary hover:underline">
            {siteConfig.url.replace(/^https:\/\//, "")}
          </Link>{" "}
          operated by {businessName}, a 3D printed products merchant based in
          Hosur, Tamil Nadu, India (&quot;we&quot;, &quot;us&quot;,
          &quot;our&quot;).
        </p>
        <p>
          By browsing this website, creating an account, or placing an order,
          you agree to these Terms and our{" "}
          <Link href="/privacy-policy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </section>

      <section id="terms-of-use" className="scroll-mt-28 space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          2. Terms of Use
        </h2>
        <p>
          You may use this website only for lawful purposes related to browsing
          and purchasing craft supplies and related products.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            You must provide accurate name, phone, email, and delivery details
            when placing an order.
          </li>
          <li>
            You must not misuse the website, attempt unauthorised access, scrape
            content, or interfere with checkout or payment systems.
          </li>
          <li>
            Product images, descriptions, and prices are for information; we may
            correct errors and update listings without prior notice.
          </li>
          <li>
            We may suspend or refuse service where we suspect fraud, abuse, or
            violation of these Terms.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          3. Orders &amp; acceptance
        </h2>
        <p>
          Placing an order is an offer to purchase. We accept your order when
          payment is successfully received and confirmed, or when we explicitly
          confirm the order by phone, WhatsApp, or email.
        </p>
        <p>
          We reserve the right to cancel or refuse any order due to stock
          unavailability, pricing errors, incomplete address details, or
          suspected fraudulent activity. If payment was collected before
          cancellation, we will arrange a refund through the original payment
          method.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          4. Pricing &amp; payments
        </h2>
        <p>
          All prices are listed in Indian Rupees (INR) unless stated otherwise.
          Applicable courier charges, GST (if enabled), and discounts are shown
          at checkout before you pay.
        </p>
        <p>
          Online payments are processed securely through authorised payment
          partners such as Cashfree and/or PhonePe. We do not store your full
          card, UPI PIN, or net-banking credentials on our servers. See our{" "}
          <Link
            href="/payment-methods"
            className="text-primary hover:underline"
          >
            Payment Methods
          </Link>{" "}
          page for details.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          5. Product information
        </h2>
        <p>
          We photograph products carefully, but colours may vary slightly due to
          screen settings, lighting, and fabric batches. Contact us before
          purchase if you need additional photos or clarification.
        </p>
        <p>
          Stock availability is shown on product pages. During high-demand
          periods, an item may become unavailable while you are checking out.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          6. Shipping, delivery &amp; returns
        </h2>
        <p>
          Delivery timelines, courier charges, and our exchange/return rules are
          described on our{" "}
          <Link
            href="/shipping-returns"
            className="text-primary hover:underline"
          >
            Shipping &amp; Returns
          </Link>{" "}
          page, which forms part of these Terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          7. Privacy &amp; data
        </h2>
        <p>
          We collect and use personal information only to process orders,
          communicate with you, and improve our service. We do not sell your
          personal data. Read our{" "}
          <Link href="/privacy-policy" className="text-primary hover:underline">
            Privacy Policy
          </Link>{" "}
          for full details.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          8. Intellectual property
        </h2>
        <p>
          All website content — including logos, product photos, text, and
          design — is owned by or licensed to {businessName}. You may not copy,
          reproduce, or use our content for commercial purposes without written
          permission.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          9. Limitation of liability
        </h2>
        <p>
          To the fullest extent permitted by applicable law, we are not liable
          for indirect or consequential loss arising from use of this website or
          delay in delivery beyond our reasonable control. Our liability for any
          eligible claim is limited to the amount you paid for the relevant
          order.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          10. Governing law
        </h2>
        <p>
          These Terms are governed by the laws of India. Courts in Salem, Tamil
          Nadu shall have jurisdiction, subject to applicable consumer
          protection laws.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          11. Changes to these Terms
        </h2>
        <p>
          We may update these Terms from time to time. The updated version will
          be posted on this page with a revised &quot;Last updated&quot; date.
          Continued use of the website after changes constitutes acceptance.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          12. Contact us
        </h2>
        <p>
          For questions about these Terms &amp; Conditions or Terms of Use,
          contact {businessName}:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {contact.addressLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
          <li>
            Phone:{" "}
            <Link
              href={contact.phoneHref}
              className="text-primary hover:underline"
            >
              {contact.phone}
            </Link>
          </li>
          {contact.email ? (
            <li>
              Email:{" "}
              <Link
                href={`mailto:${contact.email}`}
                className="text-primary hover:underline"
              >
                {contact.email}
              </Link>
            </li>
          ) : null}
          {contact.gstin ? <li>GSTIN: {contact.gstin}</li> : null}
          <li>
            <Link href="/contact" className="text-primary hover:underline">
              Contact page
            </Link>
          </li>
        </ul>
      </section>
    </InfoPage>
  );
}
