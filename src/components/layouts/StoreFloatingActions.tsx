"use client";

import Link from "next/link";
import { Mail, ShoppingBag } from "lucide-react";
import { useCartCount } from "@/features/carts/hooks/useCartCount";
import { shopMailtoHref } from "@/lib/contact/links";
import { useStorefrontContact } from "@/providers/ShopContactProvider";
import { useMobileMenu } from "./MobileMenuContext";

function CartBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
      {count > 9 ? "9+" : count}
    </span>
  );
}

const floatingActionButtonClass =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95 touch-manipulation";

export function StoreFloatingActions() {
  const { isOpen: menuOpen } = useMobileMenu();
  const cartCount = useCartCount();
  const contact = useStorefrontContact();
  const mailHref = shopMailtoHref(contact.email);

  if (menuOpen) return null;

  return (
    <div
      className="fixed right-4 z-[230] flex flex-col items-end gap-3 bottom-[calc(var(--mobile-nav-height)+1rem)] md:bottom-6"
      aria-label="Quick actions"
    >
      {mailHref ? (
        <a
          href={mailHref}
          className={`${floatingActionButtonClass} bg-primary text-white ring-2 ring-primary/40`}
          aria-label={`Email THRY at ${contact.email}`}
        >
          <Mail className="h-5 w-5" strokeWidth={2} />
        </a>
      ) : null}

      <Link
        href="/cart"
        className={`relative ${floatingActionButtonClass} border border-border bg-card text-foreground shadow-[0_4px_16px_rgba(192,48,120,0.12)]`}
        aria-label={`Cart${cartCount > 0 ? `, ${cartCount} items` : ""}`}
      >
        <ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
        <CartBadge count={cartCount} />
      </Link>
    </div>
  );
}
