"use client";

import { siteConfig } from "@/config/site";
import { useStorefrontSocial } from "@/providers/SocialLinksProvider";
import { Icons } from "./icons";
import { cn } from "@/lib/utils";
import Link from "next/link";

type SocialKey = keyof ReturnType<typeof useStorefrontSocial>;

const SOCIAL_ITEMS: {
  key: SocialKey;
  icon: keyof typeof Icons;
  label: string;
  iconColor: string;
}[] = [
  {
    key: "instagram",
    icon: "instagram",
    label: "Instagram",
    iconColor: "text-[#E1306C]",
  },
  {
    key: "youtube",
    icon: "youtube",
    label: "YouTube",
    iconColor: "text-[#FF0000]",
  },
  {
    key: "facebook",
    icon: "facebook",
    label: "Facebook",
    iconColor: "text-[#1877F2]",
  },
  {
    key: "whatsapp",
    icon: "whatsapp",
    label: "WhatsApp",
    iconColor: "text-[#25D366]",
  },
];

type Props = {
  containerClassName?: string;
  itemsClassName?: string;
  variant?: "default" | "compact";
  /** Brand colours on icons (sidebar / compact row) */
  colored?: boolean;
};

function SocialMedias({
  containerClassName,
  itemsClassName,
  variant = "default",
  colored = false,
}: Props) {
  const isCompact = variant === "compact";
  const social = useStorefrontSocial();

  return (
    <nav
      className={cn(
        "flex items-center",
        isCompact ? "gap-4" : "gap-x-5",
        containerClassName,
      )}
      aria-label="Social media"
    >
      {SOCIAL_ITEMS.map(({ key, icon, label, iconColor }) => {
        const href = social[key];
        if (!href) return null;
        const Icon = Icons[icon];

        return (
          <Link
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${label} — ${siteConfig.name}`}
            title={label}
            className="rounded-md p-0.5 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Icon
              className={cn(
                isCompact ? "h-5 w-5" : "h-4 w-4 md:h-5 md:w-5",
                colored
                  ? iconColor
                  : "text-muted-foreground transition-colors hover:text-primary",
                itemsClassName,
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}

export default SocialMedias;
