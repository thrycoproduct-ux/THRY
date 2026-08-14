"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { contactActionHref, type StoreContact } from "@/lib/contact/links";
import { useStorefrontContact } from "@/providers/ShopContactProvider";

export type ContactPickerMode = "call" | "whatsapp";

type FloatingContactPickerProps = {
  mode: ContactPickerMode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  triggerClassName: string;
  triggerLabel: string;
  triggerIcon: ReactNode;
  contacts?: readonly StoreContact[];
};

const modeStyles: Record<
  ContactPickerMode,
  { pill: string; pillHover: string; ring: string }
> = {
  call: {
    pill: "border-primary/25 bg-card",
    pillHover: "hover:border-primary/50 hover:bg-primary/[0.06]",
    ring: "ring-primary/40",
  },
  whatsapp: {
    pill: "border-[#25D366]/30 bg-card",
    pillHover: "hover:border-[#25D366]/55 hover:bg-[#25D366]/[0.08]",
    ring: "ring-[#25D366]/40",
  },
};

export function FloatingContactPicker({
  mode,
  isOpen,
  onOpenChange,
  triggerClassName,
  triggerLabel,
  triggerIcon,
  contacts,
}: FloatingContactPickerProps) {
  const storefrontContact = useStorefrontContact();
  const contactList = (contacts ?? storefrontContact.contacts).filter(
    (person) => person.phone && person.phoneHref && person.phoneHref !== "tel:",
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const styles = modeStyles[mode];

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const toggle = useCallback(() => {
    onOpenChange(!isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      close();
    };

    // Defer so the same tap that opened the menu does not immediately close it
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [close, isOpen]);

  if (contactList.length === 1) {
    const contact = contactList[0];
    const href = contactActionHref(contact, mode);
    const external = mode === "whatsapp";

    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        aria-label={
          mode === "call"
            ? `Call ${contact.name} at ${contact.phone}`
            : `WhatsApp ${contact.name} at ${contact.phone}`
        }
        className={triggerClassName}
      >
        {triggerIcon}
      </a>
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative flex shrink-0 items-center justify-end"
    >
      <div
        id={listId}
        role="menu"
        aria-label={
          mode === "call"
            ? "Choose a number to call"
            : "Choose WhatsApp contact"
        }
        className={cn(
          "absolute right-[calc(100%+0.5rem)] top-1/2 z-10 flex -translate-y-1/2 flex-col items-end gap-2 transition-all duration-300 ease-out",
          isOpen
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none hidden translate-x-3 opacity-0",
        )}
        aria-hidden={!isOpen}
      >
        {contactList.map((contact, index) => {
          const href = contactActionHref(contact, mode);
          const external = mode === "whatsapp";

          return (
            <a
              key={contact.phoneHref}
              href={href}
              role="menuitem"
              tabIndex={isOpen ? 0 : -1}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              className={cn(
                "flex min-h-[44px] min-w-[11.5rem] max-w-[min(calc(100vw-6rem),14rem)] flex-col justify-center rounded-xl border px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.12)] transition-all touch-manipulation",
                styles.pill,
                styles.pillHover,
                isOpen && "animate-in fade-in slide-in-from-right-2",
              )}
              style={
                isOpen
                  ? {
                      animationDelay: `${index * 60}ms`,
                      animationFillMode: "backwards",
                    }
                  : undefined
              }
              aria-label={
                mode === "call"
                  ? `Call ${contact.name} at ${contact.phone}`
                  : `WhatsApp ${contact.name} at ${contact.phone}`
              }
            >
              <span className="truncate text-xs font-semibold text-foreground">
                {contact.name}
              </span>
              <span
                className={cn(
                  "truncate text-sm font-medium tabular-nums",
                  mode === "call" ? "text-primary" : "text-[#128C7E]",
                )}
              >
                {contact.phone}
              </span>
            </a>
          );
        })}
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-haspopup="menu"
        aria-label={triggerLabel}
        className={cn(triggerClassName, isOpen && `ring-2 ${styles.ring}`)}
      >
        {triggerIcon}
      </button>
    </div>
  );
}
