"use client";

import Link from "next/link";
import Branding from "./Branding";
import LegalFooterLinks from "./LegalFooterLinks";
import { siteConfig } from "@/config/site";
import SocialMedias from "./SocialMedias";
import { useStorefrontContact } from "@/providers/ShopContactProvider";

function FooterLinkColumn({
  title,
  items,
}: {
  title: string;
  items: { title: string; href?: string }[];
}) {
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-foreground">{title}</p>
      <ul className="flex flex-col gap-y-2">
        {items.map((item) => {
          const href = item.href || "#";
          const isExternal =
            href.startsWith("http") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:");

          return (
            <li key={item.title}>
              <Link
                href={href}
                className="text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
                {...(isExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MainFooter() {
  const { footerNav } = siteConfig;
  const contact = useStorefrontContact();

  return (
    <footer className="mt-[80px] border-t border-primary/20 bg-muted/30 md:mt-[120px]">
      <div className="container pb-8 pt-8 md:pb-10 md:pt-10">
        <div className="mb-10 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-2 md:grid-cols-4 md:gap-x-8 lg:max-w-5xl">
          {footerNav.map((column) => (
            <FooterLinkColumn
              key={column.title}
              title={column.title ?? ""}
              items={column.items ?? []}
            />
          ))}
        </div>

        <div className="border-t border-primary/15 pt-8 md:pt-10">
          <div className="grid gap-8 md:grid-cols-[minmax(min-content,360px)_1fr_auto] md:items-start md:gap-10 lg:gap-14">
            <div className="flex min-w-0 items-center overflow-visible">
              <Branding size="footer" className="max-w-none" />
            </div>

            <div className="grid gap-6 sm:grid-cols-2 sm:gap-8 md:max-w-xl">
              <div>
                <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                  Store address
                </h3>
                <address className="space-y-0.5 not-italic text-sm leading-relaxed text-muted-foreground">
                  {contact.addressLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  {contact.gstin ? (
                    <p className="pt-2">
                      <span className="font-medium text-foreground/80">
                        GSTIN:{" "}
                      </span>
                      {contact.gstin}
                    </p>
                  ) : null}
                  {contact.email ? (
                    <p>
                      <Link
                        href={`mailto:${contact.email}`}
                        className="break-all hover:text-primary hover:underline"
                      >
                        {contact.email}
                      </Link>
                    </p>
                  ) : null}
                </address>
              </div>

              <div>
                <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                  Contact
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {contact.email ? (
                    <li className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                      <span className="shrink-0 font-medium text-foreground/80 sm:w-20">
                        Email
                      </span>
                      <Link
                        href={`mailto:${contact.email}`}
                        className="break-all hover:text-primary hover:underline"
                      >
                        {contact.email}
                      </Link>
                    </li>
                  ) : null}
                  <li className="pt-1">
                    <Link
                      href="/contact"
                      className="font-medium text-primary hover:underline"
                    >
                      View contact page →
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 md:items-end">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                Follow us
              </h3>
              <SocialMedias containerClassName="md:justify-end" colored />
            </div>
          </div>

          <LegalFooterLinks className="mb-4" />
          <p className="border-t border-primary/10 pt-6 text-center text-xs text-foreground/70">
            © {new Date().getFullYear()} {siteConfig.name}. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default MainFooter;
