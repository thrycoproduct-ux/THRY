"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * Non-critical store chrome (cart sheet, floating mail, welcome).
 * In-app browser banner is mounted via InAppBrowserBannerGate from the
 * server layout so Instagram first paint does not depend on hydration.
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

  if (!ready) return null;

  return (
    <>
      <CartSheet />
      <StoreFloatingActions />
      <WelcomeOfferDialog />
    </>
  );
}
