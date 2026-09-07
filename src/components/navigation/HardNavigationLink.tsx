"use client";

import Link from "next/link";
import type { ReactNode, MouseEvent } from "react";

type Props = {
  href: string;
  className?: string;
  children: ReactNode;
};

/**
 * Full document navigation (not Next soft routing).
 * Needed on cart escape CTAs: Instagram WebViews are unreliable with soft
 * navigations, and Clarity often marks soft Link clicks as "dead clicks".
 */
export function HardNavigationLink({ href, className, children }: Props) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Allow modified clicks (new tab) to use the real href.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    window.location.assign(href);
  };

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
