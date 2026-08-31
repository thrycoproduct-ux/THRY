"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type ListingFilterNavigationContextValue = {
  isPending: boolean;
  pushListingFilters: (href: string) => void;
};

const ListingFilterNavigationContext =
  React.createContext<ListingFilterNavigationContextValue | null>(null);

export function ListingFilterNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const pushListingFilters = React.useCallback(
    (href: string) => {
      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [router],
  );

  const value = React.useMemo(
    () => ({ isPending, pushListingFilters }),
    [isPending, pushListingFilters],
  );

  return (
    <ListingFilterNavigationContext.Provider value={value}>
      {children}
    </ListingFilterNavigationContext.Provider>
  );
}

export function useListingFilterNavigation() {
  const context = React.useContext(ListingFilterNavigationContext);
  const router = useRouter();
  const [fallbackPending, startFallbackTransition] = React.useTransition();

  const pushListingFilters = React.useCallback(
    (href: string) => {
      if (context) {
        context.pushListingFilters(href);
        return;
      }
      startFallbackTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [context, router],
  );

  return {
    isPending: context?.isPending ?? fallbackPending,
    pushListingFilters,
  };
}

export function useListingFilterNavigationPending() {
  return useListingFilterNavigation().isPending;
}
