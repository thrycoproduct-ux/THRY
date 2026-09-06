"use client";

import { useCallback, useState } from "react";
import { Mail } from "lucide-react";
import { shopMailtoHref } from "@/lib/contact/links";
import { useStorefrontContact } from "@/providers/ShopContactProvider";
import { FloatingMailPicker } from "./FloatingMailPicker";
import { useMobileMenu } from "./MobileMenuContext";
import { useCheckoutChrome } from "@/providers/CheckoutChromeProvider";

const floatingActionButtonClass =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95 touch-manipulation";

/**
 * Floating email only — cart stays in the navbar / mobile bottom nav.
 */
export function StoreFloatingActions() {
  const { isOpen: menuOpen } = useMobileMenu();
  const { hideStoreChrome } = useCheckoutChrome();
  const contact = useStorefrontContact();
  const mailHref = shopMailtoHref(contact.email);
  const [mailOpen, setMailOpen] = useState(false);

  const handleMailOpenChange = useCallback((open: boolean) => {
    setMailOpen(open);
  }, []);

  if (menuOpen || hideStoreChrome) return null;
  if (!mailHref || !contact.email) return null;

  return (
    <>
      {mailOpen ? (
        <div
          className="fixed inset-0 z-[225] bg-black/10 backdrop-blur-[1px] md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
          aria-hidden
          onClick={() => setMailOpen(false)}
        />
      ) : null}

      <div
        className="fixed right-4 z-[230] flex flex-col items-end gap-3 bottom-[calc(var(--mobile-nav-height)+1rem)] md:bottom-6"
        aria-label="Quick actions"
      >
        <FloatingMailPicker
          email={contact.email}
          mailHref={mailHref}
          isOpen={mailOpen}
          onOpenChange={handleMailOpenChange}
          triggerLabel="Email THRY"
          triggerClassName={`${floatingActionButtonClass} bg-primary text-white ring-2 ring-primary/40`}
          triggerIcon={<Mail className="h-5 w-5" strokeWidth={2} />}
        />
      </div>
    </>
  );
}
