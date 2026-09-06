"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

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

/**
 * Cart stub / welcome / floating actions wait for idle or first input so the
 * hero LCP is not competing for bandwidth. InAppBrowserBanner mounts immediately
 * (Instagram / WebView conversion).
 */
export function StoreDeferredChrome() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let done = false;

    const enable = () => {
      if (done) return;
      done = true;
      setReady(true);
    };

    const onInteract = () => enable();

    window.addEventListener("pointerdown", onInteract, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", onInteract, { once: true });

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(enable, { timeout: 2500 });
    } else {
      timeoutId = setTimeout(enable, 2000);
    }

    return () => {
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
      if (idleId != null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <>
      <InAppBrowserBanner />
      {ready ? (
        <>
          <CartSheet />
          <StoreFloatingActions />
          <WelcomeOfferDialog />
        </>
      ) : null}
    </>
  );
}
