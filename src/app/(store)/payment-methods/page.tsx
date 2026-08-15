import InfoPage from "@/components/layouts/InfoPage";
import { siteConfig } from "@/config/site";
import Link from "next/link";
import { Metadata } from "next";
import { STOREFRONT_STATIC_REVALIDATE_SECONDS } from "@/lib/cache/constants";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Payment Methods | ${siteConfig.name}`,
  description: `How to pay for products at ${siteConfig.name}`,
};

export default function PaymentMethodsPage() {
  return (
    <InfoPage
      heading="Payment Methods"
      description="Secure online checkout and in-store payment options."
    >
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Online orders
        </h2>
        <p>
          When you checkout on our website, you can pay securely using UPI,
          major debit and credit cards, and net banking through our payment
          partners (Razorpay, Cashfree, or PhonePe). All transactions are
          processed in <strong>Indian Rupees (INR)</strong>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">In-store</h2>
        <p>
          Visit us at our Hosur store ({siteConfig.address}) to pay by cash,
          UPI, or card. Our team can help you choose 3D printed products and
          gifts.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          WhatsApp orders
        </h2>
        <p>
          For large or custom orders, you may arrange payment via UPI or bank
          transfer after confirming details on{" "}
          <Link
            href={siteConfig.social.whatsapp}
            className="text-primary hover:underline"
          >
            WhatsApp
          </Link>
          .
        </p>
      </section>
    </InfoPage>
  );
}
