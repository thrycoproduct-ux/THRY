import Link from "next/link";

import { BrandWordmark } from "@/components/layouts/BrandWordmark";
import { siteConfig } from "@/config/site";

type AdminSidebarBrandProps = {
  className?: string;
};

export function AdminSidebarBrand({ className }: AdminSidebarBrandProps) {
  return (
    <Link href="/admin/dashboard" className={className}>
      <BrandWordmark size="nav" />
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold text-foreground">
          {siteConfig.shortName}
        </span>
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
          Admin
        </span>
      </span>
    </Link>
  );
}
