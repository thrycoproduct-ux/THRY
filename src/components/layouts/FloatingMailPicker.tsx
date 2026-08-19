"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type FloatingMailPickerProps = {
  email: string;
  mailHref: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  triggerClassName: string;
  triggerLabel: string;
  triggerIcon: ReactNode;
};

async function copyEmailAddress(email: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(email);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = email;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(field);
    return ok;
  }
}

export function FloatingMailPicker({
  email,
  mailHref,
  isOpen,
  onOpenChange,
  triggerClassName,
  triggerLabel,
  triggerIcon,
}: FloatingMailPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [copied, setCopied] = useState(false);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const toggle = useCallback(() => {
    onOpenChange(!isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      return;
    }

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

    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [close, isOpen]);

  const handleCopy = useCallback(async () => {
    const ok = await copyEmailAddress(email);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [email]);

  return (
    <div
      ref={rootRef}
      className="relative flex shrink-0 items-center justify-end"
    >
      <div
        id={listId}
        role="menu"
        aria-label="Shop email"
        className={cn(
          "absolute right-[calc(100%+0.5rem)] top-1/2 z-10 flex -translate-y-1/2 flex-col items-end gap-2 transition-all duration-300 ease-out",
          isOpen
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none hidden translate-x-3 opacity-0",
        )}
        aria-hidden={!isOpen}
      >
        <div
          role="menuitem"
          className={cn(
            "flex min-h-[44px] min-w-[13rem] max-w-[min(calc(100vw-6rem),18rem)] items-center gap-2 rounded-xl border border-primary/25 bg-card px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.12)]",
            isOpen && "animate-in fade-in slide-in-from-right-2",
          )}
        >
          <button
            type="button"
            onClick={handleCopy}
            className="min-w-0 flex-1 touch-manipulation text-left"
            aria-label={`Copy ${email}`}
          >
            <span className="block truncate text-xs font-semibold text-foreground">
              {copied ? "Copied" : "Email THRY"}
            </span>
            <span className="block truncate text-sm font-medium text-primary">
              {email}
            </span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary touch-manipulation hover:bg-primary/10"
            aria-label={copied ? "Email copied" : "Copy email"}
          >
            {copied ? (
              <Check className="h-4 w-4" strokeWidth={2} />
            ) : (
              <Copy className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        </div>

        <a
          href={mailHref}
          role="menuitem"
          tabIndex={isOpen ? 0 : -1}
          className="flex min-h-[36px] items-center rounded-xl border border-primary/25 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-[0_4px_20px_rgba(0,0,0,0.12)] touch-manipulation hover:bg-primary/[0.06]"
        >
          Open mail app
        </a>
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-haspopup="menu"
        aria-label={triggerLabel}
        className={cn(triggerClassName, isOpen && "ring-2 ring-primary/40")}
      >
        {triggerIcon}
      </button>
    </div>
  );
}
