import InfoPage from "@/components/layouts/InfoPage";
import { resolveStorefrontContact } from "@/lib/integrations/settings";
import { ORDER_SHIPPING } from "@/lib/storefront/order-shipping";
import { shopMailtoHref } from "@/lib/contact/links";
import Link from "next/link";
import { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Shipping & Returns | THRY",
  description:
    "Simple order processing and delivery times for THRY — Tamil Nadu, India, and international.",
};

export default async function ShippingReturnsPage() {
  const contact = await resolveStorefrontContact();
  const mailHref = shopMailtoHref(contact.email);

  return (
    <InfoPage
      heading="Order processing & shipping"
      description="Simple guide to how long orders take — so every buyer knows what to expect."
    >
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          {ORDER_SHIPPING.processingLabel}
        </h2>
        <p>
          We need <strong>{ORDER_SHIPPING.processing}</strong> to prepare your
          order. {ORDER_SHIPPING.processingNote}
        </p>
        <p>{ORDER_SHIPPING.readyStock}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          {ORDER_SHIPPING.deliveryLabel}
        </h2>
        <ul className="list-disc space-y-1.5 pl-5">
          {ORDER_SHIPPING.regions.map((row) => (
            <li key={row.place}>
              <strong>{row.place}:</strong> {row.time}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Tracking your order
        </h2>
        <p>{ORDER_SHIPPING.tracking}</p>
        {mailHref ? (
          <>
            <p>{ORDER_SHIPPING.contactPrompt}</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Email:{" "}
                <Link href={mailHref} className="text-primary hover:underline">
                  {contact.email}
                </Link>
              </li>
            </ul>
          </>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Wholesale orders
        </h2>
        <p>{ORDER_SHIPPING.wholesale}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Returns & exchanges
        </h2>
        <p>
          Returns or exchanges may be accepted within <strong>7 days</strong> of
          delivery for unused items with original packaging intact.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Please email us before sending any item back.</li>
          <li>Customised, opened, or used craft kits cannot be returned.</li>
          <li>
            Shipping charges for returns may apply unless the item is faulty.
          </li>
        </ul>
      </section>
    </InfoPage>
  );
}
