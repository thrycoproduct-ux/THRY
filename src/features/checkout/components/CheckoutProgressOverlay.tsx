"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Spinner } from "@/components/ui/spinner";
import type { CheckoutProgressUpdate } from "@/features/checkout/checkout-progress";

type Props = CheckoutProgressUpdate & {
  open: boolean;
};

export function CheckoutProgressOverlay({ open, title, message }: Props) {
  const [barWidth, setBarWidth] = useState(8);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setBarWidth(8);
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      // Ease toward 92% over ~35s so the bar keeps moving during slow steps.
      const next = Math.min(92, 8 + (elapsed / 35000) * 84);
      setBarWidth(next);
    }, 120);

    return () => window.clearInterval(timer);
  }, [open]);

  if (!open || !mounted) return null;

  // The cart/PDP checkout buttons live inside sticky bars that use backdrop-blur,
  // which turns them into the containing block for position:fixed children. Without
  // a portal this overlay collapses into that bar instead of covering the viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-[250] flex min-h-[100svh] items-center justify-center bg-black/50 backdrop-blur-[2px] pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
      aria-labelledby="checkout-progress-title"
      aria-describedby="checkout-progress-message"
    >
      <div className="w-[min(92vw,380px)] rounded-xl border border-[#E8A317]/40 bg-background p-6 shadow-2xl">
        <div className="flex flex-col items-center gap-3">
          <Spinner
            className="h-8 w-8 animate-spin text-[#E8A317]"
            aria-hidden="true"
          />
          <p
            id="checkout-progress-title"
            className="text-center text-base font-semibold text-foreground"
          >
            {title}
          </p>
        </div>
        <p
          id="checkout-progress-message"
          className="mt-2 text-center text-sm text-muted-foreground"
        >
          {message}
        </p>
        <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-[#FDECC8]">
          <div
            className="relative h-full overflow-hidden rounded-full bg-[#E8A317]/25"
            style={{ width: `${barWidth}%` }}
          >
            <div className="checkout-progress-shimmer absolute inset-y-0 w-1/2 rounded-full bg-[#E8A317]" />
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Please wait — do not press back or close this tab.
        </p>
      </div>
    </div>,
    document.body,
  );
}

export default CheckoutProgressOverlay;
