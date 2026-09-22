import InfoPage from "@/components/layouts/InfoPage";
import { resolveStorefrontContact } from "@/lib/integrations/settings";
import { shopMailtoHref } from "@/lib/contact/links";
import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact | THRY",
  description: "Contact THRY by email for orders and enquiries — Hosur, Tamil Nadu",
};

export const revalidate = 60;

export default async function ContactPage() {
  const contact = await resolveStorefrontContact();
  const mailHref = shopMailtoHref(contact.email);

  return (
    <InfoPage
      heading="Contact Us"
      description="Reach THRY by email for orders and enquiries."
    >
      <section id="store" className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Business address
        </h2>
        <p className="text-muted-foreground">
          This is our manufacturing unit address for correspondence. It is not
          open for customer visits.
        </p>
        <address className="not-italic space-y-0.5">
          {contact.addressLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {contact.gstin ? (
            <p className="pt-2 text-muted-foreground">
              <span className="font-medium text-foreground">GSTIN: </span>
              {contact.gstin}
            </p>
          ) : null}
        </address>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Email</h2>
        {mailHref ? (
          <p>
            <Link href={mailHref} className="text-primary hover:underline">
              {contact.email}
            </Link>
          </p>
        ) : (
          <p className="text-muted-foreground">
            Email coming soon. Use the contact form on this site when it is
            available.
          </p>
        )}
      </section>
    </InfoPage>
  );
}
