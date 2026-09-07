import CartDeepLinkAdd from "@/features/carts/components/CartDeepLinkAdd";
import CartSection from "@/features/carts/components/CartSection";
import RecommendationProductsSection from "@/features/products/components/RecommendationProductsSection";
import { HardNavigationLink } from "@/components/navigation/HardNavigationLink";
import { Shell } from "@/components/layouts/Shell";
import { getSessionUser } from "@/lib/auth/admin";
import { prefetchCartPageData } from "@/lib/storefront/cart-server";

export const dynamic = "force-dynamic";

async function CartPage() {
  const [prefetch, serverUser] = await Promise.all([
    prefetchCartPageData(),
    getSessionUser(),
  ]);

  return (
    <Shell>
      <section className="flex items-center justify-between gap-3 py-4 md:py-8">
        <h1 className="text-2xl font-bold md:text-3xl">Your Cart</h1>
        <HardNavigationLink
          href="/shop"
          className="shrink-0 text-sm font-medium text-primary md:text-base"
        >
          Continue shopping
        </HardNavigationLink>
      </section>

      <CartDeepLinkAdd />

      <CartSection
        serverUserId={serverUser?.id ?? null}
        guestCartItems={prefetch.guestCartItems}
        guestCartProducts={prefetch.guestCartProducts}
        userCart={prefetch.userCart}
        sizeConfigs={prefetch.sizeConfigs}
        prefetchedProductIds={prefetch.prefetchedProductIds}
      />

      {/* Show on mobile too — empty-cart visitors (esp. Instagram) need a next step. */}
      <div className="mt-6">
        <RecommendationProductsSection />
      </div>
    </Shell>
  );
}

export default CartPage;
