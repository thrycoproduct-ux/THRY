"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { SheetClose } from "@/components/ui/sheet";
import { ORDER_SHIPPING } from "@/lib/storefront/order-shipping";
import { shopMailtoHref } from "@/lib/contact/links";
import { useStorefrontContact } from "@/providers/ShopContactProvider";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 touch-manipulation";

/**
 * Menu sidebar: only main timings + email contact.
 * Extra notes live on Full details (/shipping-returns).
 */
export function SideMenuOrderShipping({ className }: Props) {
  const contact = useStorefrontContact();
  const mailHref = shopMailtoHref(contact.email);

  return (
    <section
      className={cn("space-y-2", className)}
      aria-labelledby="side-menu-shipping-title"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id="side-menu-shipping-title"
          className="text-[10px] font-semibold uppercase tracking-wide text-primary/70"
        >
          {ORDER_SHIPPING.title}
        </h2>
        <SheetClose asChild>
          <Link
            href={ORDER_SHIPPING.fullDetailsHref}
            className="shrink-0 text-[10px] font-semibold text-primary underline-offset-2 hover:underline"
          >
            {ORDER_SHIPPING.fullDetailsLabel}
          </Link>
        </SheetClose>
      </div>

      <dl className="rounded-xl border border-primary/10 bg-card/80 px-2.5 py-2 text-[11px] leading-snug">
        <div className="flex items-baseline justify-between gap-2 border-b border-primary/10 pb-1.5">
          <dt className="font-semibold text-foreground">
            {ORDER_SHIPPING.processingLabel}
          </dt>
          <dd className="text-right text-muted-foreground">
            {ORDER_SHIPPING.processing}
          </dd>
        </div>

        <div className="pt-1.5">
          <dt className="mb-1 font-semibold text-foreground">
            {ORDER_SHIPPING.deliveryLabel}
          </dt>
          <dd>
            <ul className="space-y-1">
              {ORDER_SHIPPING.regions.map((row) => (
                <li
                  key={row.place}
                  className="flex items-baseline justify-between gap-2 text-muted-foreground"
                >
                  <span className="text-foreground/90">{row.placeShort}</span>
                  <span className="shrink-0 tabular-nums">{row.time}</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>

      {mailHref ? (
        <div className="flex items-end gap-3 pt-0.5">
          <div className="flex flex-col items-center">
            <a
              href={mailHref}
              aria-label={`Email us at ${contact.email}`}
              title={ORDER_SHIPPING.contactEmail}
              className={cn(
                iconBtn,
                "border-primary/25 bg-primary/10 text-primary hover:bg-primary/15 focus-visible:ring-primary/40",
              )}
            >
              <Mail className="h-4 w-4" strokeWidth={2} />
            </a>
            <span className="mt-1 text-[9px] font-medium text-muted-foreground">
              {ORDER_SHIPPING.contactEmail}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
