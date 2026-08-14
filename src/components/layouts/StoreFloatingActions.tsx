"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { PhoneCall, ShoppingBag } from "lucide-react";
import { Icons } from "@/components/layouts/icons";
import { useCartCount } from "@/features/carts/hooks/useCartCount";
import { useMobileMenu } from "./MobileMenuContext";
import {
  FloatingContactPicker,
  type ContactPickerMode,
} from "./FloatingContactPicker";

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
  const [openPicker, setOpenPicker] = useState<ContactPickerMode | null>(null);

  const handlePickerChange = useCallback(
    (mode: ContactPickerMode, open: boolean) => {
      setOpenPicker(open ? mode : null);
    },
    [],
  );

  if (menuOpen) return null;

  return (
    <>
      {openPicker ? (
        <div
          className="fixed inset-0 z-[225] bg-black/10 backdrop-blur-[1px] md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
          aria-hidden
          onClick={() => setOpenPicker(null)}
        />
      ) : null}

      <div
        className="fixed right-4 z-[230] flex flex-col items-end gap-3 bottom-[calc(var(--mobile-nav-height)+1rem)] md:bottom-6"
        aria-label="Quick actions"
      >
        <FloatingContactPicker
          mode="call"
          isOpen={openPicker === "call"}
          onOpenChange={(open) => handlePickerChange("call", open)}
          triggerLabel="Call THRY"
          triggerClassName={`animate-phone-glow ${floatingActionButtonClass} bg-primary text-white ring-2 ring-primary/40`}
          triggerIcon={<PhoneCall className="h-5 w-5" strokeWidth={2} />}
        />

        <Link
          href="/cart"
          className={`relative ${floatingActionButtonClass} border border-border bg-card text-foreground shadow-[0_4px_16px_rgba(192,48,120,0.12)]`}
          aria-label={`Cart${cartCount > 0 ? `, ${cartCount} items` : ""}`}
        >
          <ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
          <CartBadge count={cartCount} />
        </Link>

        <FloatingContactPicker
          mode="whatsapp"
          isOpen={openPicker === "whatsapp"}
          onOpenChange={(open) => handlePickerChange("whatsapp", open)}
          triggerLabel="Chat on WhatsApp"
          triggerClassName={`animate-whatsapp-glow ${floatingActionButtonClass} bg-[#25D366] text-white ring-2 ring-[#25D366]/40`}
          triggerIcon={<Icons.whatsapp className="h-5 w-5" />}
        />
      </div>
    </>
  );
}
