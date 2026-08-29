"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Heart, Search, ShoppingCart, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartCount } from "@/features/carts/hooks/useCartCount";
import useWishlistStore from "@/features/wishlists/useWishlistStore";
import { useMobileSearch } from "@/components/layouts/MobileSearchContext";
import { useRobustNavigate } from "@/hooks/useRobustNavigate";
import { useAuth } from "@/providers/AuthProvider";
import { useCheckoutChrome } from "@/providers/CheckoutChromeProvider";

function NavBadge({ count }: { count: number }) {
  return (
    <span
      className={cn(
        "absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white",
        count <= 0 && "opacity-0 scale-0",
      )}
      aria-hidden={count <= 0}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

type NavItem = {
  href?: string;
  label: string;
  active: boolean;
  icon: ReactNode;
  onClick?: () => void;
};

export function MobileBottomNav() {
  const pathname = usePathname();
  const cartCount = useCartCount();
  const wishlist = useWishlistStore((s) => s.wishlist);
  const wishCount = Object.keys(wishlist).length;
  const { onNavigateClick } = useRobustNavigate();
  const { isOpen: isSearchOpen, openSearch } = useMobileSearch();
  const { user } = useAuth();
  const { hideStoreChrome } = useCheckoutChrome();
  const accountHref = user ? "/orders" : "/sign-in";

  if (hideStoreChrome) return null;

  const itemClass = (active: boolean) =>
    cn(
      "relative z-[1] flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium leading-none touch-manipulation select-none",
      active ? "text-white" : "text-white/75",
    );

  const items: NavItem[] = [
    {
      href: "/",
      label: "Home",
      active: pathname === "/",
      icon: (
        <Home
          className="h-5 w-5 shrink-0"
          strokeWidth={pathname === "/" ? 2.25 : 1.75}
        />
      ),
    },
    {
      label: "Search",
      active:
        isSearchOpen || pathname === "/shop" || pathname.startsWith("/shop/"),
      icon: <Search className="h-5 w-5 shrink-0" strokeWidth={1.75} />,
      onClick: openSearch,
    },
    {
      href: accountHref,
      label: "Account",
      active: user
        ? pathname.startsWith("/orders") || pathname.startsWith("/setting")
        : pathname.startsWith("/sign"),
      icon: <User className="h-5 w-5 shrink-0" strokeWidth={1.75} />,
    },
    {
      href: "/wish-list",
      label: "Wishlist",
      active: pathname === "/wish-list",
      icon: (
        <span className="relative inline-flex">
          <Heart className="h-5 w-5 shrink-0" strokeWidth={1.75} />
          <NavBadge count={wishCount} />
        </span>
      ),
    },
    {
      href: "/cart",
      label: "Cart",
      active: pathname === "/cart",
      icon: (
        <span className="relative inline-flex">
          <ShoppingCart className="h-5 w-5 shrink-0" strokeWidth={1.75} />
          <NavBadge count={cartCount} />
        </span>
      ),
    },
  ];

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-[220] isolate border-t border-zinc-700 bg-zinc-900 pb-[env(safe-area-inset-bottom,0px)] text-white shadow-[0_-4px_24px_rgba(0,0,0,0.35)]"
      aria-label="Mobile navigation"
    >
      <div className="mx-auto flex h-14 max-w-lg items-stretch justify-around">
        {items.map((item) => {
          const key = item.href ?? item.label;

          if (item.onClick) {
            return (
              <button
                key={key}
                type="button"
                onClick={item.onClick}
                className={itemClass(item.active)}
                aria-current={item.active ? "page" : undefined}
                aria-label={item.label}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={key}
              href={item.href!}
              prefetch
              onClick={onNavigateClick(item.href!)}
              className={itemClass(item.active)}
              aria-current={item.active ? "page" : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
