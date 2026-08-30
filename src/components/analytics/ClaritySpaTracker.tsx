"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { clarityEvent, claritySetPage } from "@/lib/analytics/clarity-client";

/**
 * Sync Clarity page identity on App Router soft navigations and mark cart views.
 * Required for checkout page-load / funnel insights on Next.js SPAs.
 */
export function ClaritySpaTracker() {
  const pathname = usePathname() || "/";
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    claritySetPage(pathname);
    if (pathname === "/cart" || pathname.startsWith("/cart/")) {
      clarityEvent("cart_view");
    }
  }, [pathname]);

  return null;
}
