"use client";

import Link from "next/link";
import { ToastAction } from "@/components/ui/toast";
import type { useToast } from "@/components/ui/use-toast";

type ToastFn = ReturnType<typeof useToast>["toast"];

export const CART_ADDED_EVENT = "thry:cart-added";

/** Notify header/mobile cart badges to pulse after a successful add. */
export function notifyCartAdded() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(CART_ADDED_EVENT));
  } catch {
    /* ignore */
  }
}

/**
 * Industry-style add-to-cart confirmation: clear copy + View cart CTA.
 * Placement is handled by ToastViewport (near cart on mobile + desktop).
 */
export function scheduleAddedToCartToast(
  toast: ToastFn,
  options?: { silent?: boolean },
) {
  if (options?.silent) return;
  queueMicrotask(() => {
    notifyCartAdded();
    toast({
      title: "Added to cart",
      description: "Your bag is updated. Review items anytime.",
      duration: 4500,
      action: (
        <ToastAction altText="View cart" asChild>
          <Link href="/cart">View cart</Link>
        </ToastAction>
      ),
    });
  });
}
