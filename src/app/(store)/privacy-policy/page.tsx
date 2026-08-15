import InfoPage from "@/components/layouts/InfoPage";
import { siteConfig } from "@/config/site";
import { resolveStorefrontContact } from "@/lib/integrations/settings";
import { STOREFRONT_STATIC_REVALIDATE_SECONDS } from "@/lib/cache/constants";
import Link from "next/link";
import { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Privacy Policy | THRY",
  description:
    "Privacy Policy explaining how THRY collects and uses customer information.",
  alternates: {
    canonical: "/privacy-policy",
  },
};

export default async function PrivacyPolicyPage() {
  const contact = await resolveStorefrontContact();
  const businessName = siteConfig.name.replace("®", "").trim();
  const lastUpdated = "7 July 2026";

  return (
    <InfoPage
      heading="Privacy Policy"
      description={`How ${businessName} collects, uses, and protects your personal information.`}
    >
      <p className="text-xs text-muted-foreground">
        Last updated: {lastUpdated}
      </p>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">1. Overview</h2>
        <p>
          {businessName} (&quot;we&quot;, &quot;us&quot;) respects your privacy.
          This Privacy Policy explains what information we collect when you use
          our website, place an order, or contact us, and how we use it.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          2. Information we collect
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Order details:</strong> name, phone number, email, delivery
            address, and products purchased.
          </li>
          <li>
            <strong>Account information:</strong> if you sign in (e.g. email,
            profile name) via our authentication provider.
          </li>
          <li>
            <strong>Payment information:</strong> payments are handled by secure
            third-party gateways (such as Cashfree/PhonePe). We receive payment
            status and reference IDs, not your full card or UPI credentials.
          </li>
          <li>
            <strong>Technical data:</strong> basic device/browser data and
            cookies needed to operate the site, cart, and checkout.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          3. How we use your information
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Process and deliver your orders.</li>
          <li>Send order confirmations and customer support messages.</li>
          <li>Prevent fraud and maintain website security.</li>
          <li>Improve our products, website, and service quality.</li>
          <li>Comply with legal and tax requirements where applicable.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          4. Sharing of information
        </h2>
        <p>
          We do not sell your personal information. We share data only with
          trusted service providers necessary to operate our store, such as:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Payment processors (Cashfree, PhonePe, etc.)</li>
          <li>Hosting, database, and messaging providers</li>
          <li>Courier partners for order delivery</li>
        </ul>
        <p>
          These providers process data according to their own privacy policies
          and applicable regulations.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          5. Data retention
        </h2>
        <p>
          We retain order and contact records for as long as needed to fulfil
          orders, handle returns, maintain accounts, and meet legal/accounting
          obligations.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          6. Your choices
        </h2>
        <p>
          You may request correction of your contact details or ask questions
          about your data by contacting us using the details below. You may sign
          out of your account at any time.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">7. Security</h2>
        <p>
          We use industry-standard security measures including HTTPS, access
          controls, and secure payment partners. No online system is completely
          secure; please use strong passwords and protect your account
          credentials.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          8. Related policies
        </h2>
        <p>
          Please also read our{" "}
          <Link
            href="/terms-and-conditions"
            className="text-primary hover:underline"
          >
            Terms &amp; Conditions
          </Link>
          ,{" "}
          <Link
            href="/terms-and-conditions#terms-of-use"
            className="text-primary hover:underline"
          >
            Terms of Use
          </Link>
          , and{" "}
          <Link
            href="/shipping-returns"
            className="text-primary hover:underline"
          >
            Shipping &amp; Returns
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">9. Contact</h2>
        <p>For privacy-related questions, contact us:</p>
        <ul className="list-disc space-y-1 pl-5">
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
