import MainFooter from "@/components/layouts/MainFooter";
import { MobileMenuProvider } from "@/components/layouts/MobileMenuContext";
import { MobileSearchProvider } from "@/components/layouts/MobileSearchContext";
import { MobileSearchOverlay } from "@/components/layouts/MobileSearchOverlay";
import Navbar from "@/components/layouts/MainNavbar";
import { StoreHeaderMetrics } from "@/components/layouts/StoreHeaderMetrics";
import { StoreDeferredChrome } from "@/components/layouts/StoreDeferredChrome";
import { InAppBrowserBannerGate } from "@/components/layouts/InAppBrowserBannerGate";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  getDefaultStorefrontRuntimeBundle,
  getStorefrontRuntimeBundleCached,
} from "@/lib/integrations/settings";
import {
  buildOrganizationJsonLd,
  buildSiteNavigationJsonLd,
  buildStoreJsonLd,
  buildWebsiteJsonLd,
} from "@/lib/seo/json-ld";
import { AnnouncementsProvider } from "@/providers/AnnouncementsProvider";
import { BulkOrderGuardProvider } from "@/providers/BulkOrderGuardProvider";
import { CourierChargesProvider } from "@/providers/CourierChargesProvider";
import { OfferCodesProvider } from "@/providers/OfferCodesProvider";
import { ShopContactProvider } from "@/providers/ShopContactProvider";
import { SocialLinksProvider } from "@/providers/SocialLinksProvider";
import { StockControlProvider } from "@/providers/StockControlProvider";
import { ReactNode } from "react";

type Props = { children: ReactNode };

export const revalidate = 120;

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
  label: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => {
          console.error(`[store-layout] ${label} timed out after ${ms}ms`);
          resolve(fallback);
        }, ms);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function StoreLayout({ children }: Props) {
  const {
    contact,
    social,
    announcements,
    bulkOrderGuard,
    stockControl,
    courierCharges,
    offerCodes,
  } = await withTimeout(
    getStorefrontRuntimeBundleCached(),
    4000,
    getDefaultStorefrontRuntimeBundle(),
    "runtimeBundle",
  );

  // Stock reservation cleanup stays on the cron API — not on every page view.

  return (
    <SocialLinksProvider social={social}>
      <ShopContactProvider contact={contact}>
        <JsonLd
          data={[
            buildOrganizationJsonLd(),
            buildWebsiteJsonLd(),
            buildStoreJsonLd(),
            buildSiteNavigationJsonLd(),
          ]}
        />
        <AnnouncementsProvider announcements={announcements}>
          <BulkOrderGuardProvider config={bulkOrderGuard}>
            <StockControlProvider config={stockControl}>
              <CourierChargesProvider config={courierCharges}>
                <OfferCodesProvider config={offerCodes}>
                  <MobileMenuProvider>
                    <MobileSearchProvider>
                      <StoreHeaderMetrics />
                      <Navbar />
                      <MobileSearchOverlay />
                      <main className="storefront-atmosphere w-full max-w-[100vw] overflow-x-hidden pt-[var(--store-header-offset-mobile)] md:pt-[var(--store-header-offset-desktop)] pb-[var(--mobile-nav-height)] md:pb-0">
                        {children}
                      </main>
                      <InAppBrowserBannerGate />
                      <StoreDeferredChrome />
                      <MobileBottomNav />
                      <div className="md:contents pb-[var(--mobile-nav-height)] md:pb-0">
                        <MainFooter />
                      </div>
                    </MobileSearchProvider>
                  </MobileMenuProvider>
                </OfferCodesProvider>
              </CourierChargesProvider>
            </StockControlProvider>
          </BulkOrderGuardProvider>
        </AnnouncementsProvider>
      </ShopContactProvider>
    </SocialLinksProvider>
  );
}

export default StoreLayout;
