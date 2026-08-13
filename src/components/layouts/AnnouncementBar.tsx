"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useStorefrontAnnouncements } from "@/providers/AnnouncementsProvider";
import type { StorefrontAnnouncement } from "@/lib/announcements/types";

type Announcement = StorefrontAnnouncement;

function isExternalHref(href: string) {
  return (
    href.startsWith("http") ||
    href.startsWith("tel:") ||
    href.startsWith("mailto:")
  );
}

function MarqueeItem({ item }: { item: Announcement }) {
  const className =
    "inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-foreground/90 transition-opacity hover:text-foreground sm:text-sm";

  const content = (
    <>
      <span>{item.text}</span>
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-rose sm:text-[11px]">
        {item.cta}
        <ChevronRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      </span>
    </>
  );

  if (isExternalHref(item.href)) {
    return (
      <a href={item.href} className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={item.href} className={className}>
      {content}
    </Link>
  );
}

function MarqueeStrip({
  items,
  duplicate = false,
}: {
  items: Announcement[];
  duplicate?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-10 pr-10 sm:gap-14 sm:pr-14",
        duplicate && "pointer-events-none",
      )}
      aria-hidden={duplicate}
    >
      {items.map((item, index) => (
        <span
          key={`${item.text}-${index}`}
          className="inline-flex items-center gap-10 sm:gap-14"
        >
          {index > 0 ? (
            <span className="select-none text-brand-gold" aria-hidden>
              ◆
            </span>
          ) : null}
          <MarqueeItem item={item} />
        </span>
      ))}
    </div>
  );
}

function AnnouncementShell({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn("announcement-craft group/announcement", className)}
      aria-label={label}
    >
      <div className="announcement-craft-rail">{children}</div>
    </div>
  );
}

export function AnnouncementBar() {
  const { enabled, items } = useStorefrontAnnouncements();
  if (!enabled || !items.length) return null;

  if (items.length === 1) {
    const item = items[0];
    return (
      <AnnouncementShell>
        <div className="flex h-[var(--announcement-rail-height)] items-center justify-center gap-2 px-3 sm:px-4">
          <MarqueeItem item={item} />
        </div>
      </AnnouncementShell>
    );
  }

  return (
    <AnnouncementShell label="Store announcements">
      <div className="flex h-[var(--announcement-rail-height)] items-center">
        <div className="announcement-marquee-mask relative min-w-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "announcement-marquee-track flex w-max items-center",
              "animate-announcement-scroll",
              "group-hover/announcement:[animation-play-state:paused]",
            )}
          >
            <MarqueeStrip items={items} />
            <MarqueeStrip items={items} duplicate />
          </div>
        </div>
      </div>
    </AnnouncementShell>
  );
}
