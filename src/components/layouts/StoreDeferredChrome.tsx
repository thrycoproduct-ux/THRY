"use client";

import dynamic from "next/dynamic";

/**
 * Non-critical store chrome: load in the browser only.
 * Keeps Worker SSR cheaper without changing cart/floating behavior after hydrate.
 */
const CartSheet = dynamic(
  () => import("@/features/carts").then((mod) => mod.CartSheet),
  { ssr: false },
);

const StoreFloatingActions = dynamic(
  () =>
    import("@/components/layouts/StoreFloatingActions").then(
      (mod) => mod.StoreFloatingActions,
    ),
  { ssr: false },
);

const WelcomeOfferDialog = dynamic(
  () =>
    import("@/features/offers/components/WelcomeOfferDialog").then(
      (mod) => mod.WelcomeOfferDialog,
    ),
  { ssr: false },
);

const InAppBrowserBanner = dynamic(
  () =>
    import("@/components/layouts/InAppBrowserBanner").then(
      (mod) => mod.InAppBrowserBanner,
    ),
  { ssr: false },
);

export function StoreDeferredChrome() {
  return (
    <>
      <CartSheet />
      <StoreFloatingActions />
      <WelcomeOfferDialog />
      <InAppBrowserBanner />
    </>
  );
}
