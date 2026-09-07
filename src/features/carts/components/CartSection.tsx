"use client";
import { useAuth } from "@/providers/AuthProvider";
import type { CartPagePrefetch } from "@/lib/storefront/cart-server";
import type { User } from "@supabase/supabase-js";
import UserCartSection from "./UserCartSection";
import GuestCartSection from "./GuestCartSection";
import { cartHasLines, shouldShowGuestCart } from "../guest-cart-merge";

type CartSectionProps = Pick<
  CartPagePrefetch,
  | "guestCartItems"
  | "guestCartProducts"
  | "userCart"
  | "sizeConfigs"
  | "prefetchedProductIds"
> & {
  serverUserId?: string | null;
};

function CartSection({
  serverUserId,
  guestCartItems,
  guestCartProducts,
  userCart,
  sizeConfigs,
  prefetchedProductIds,
}: CartSectionProps) {
  const { user: clientUser } = useAuth();
  const activeUserId = clientUser?.id ?? serverUserId ?? null;
  const userCartHasLines = Boolean(userCart?.cartsCollection?.edges?.length);
  // Authenticated users always use the DB cart — never fall back to a stale
  // guest cookie (that resurrected removed lines after refresh).
  const showGuestCart = shouldShowGuestCart({
    activeUserId,
    userCartHasLines,
    guestHasLines: cartHasLines(guestCartItems),
  });

  if (activeUserId && !showGuestCart) {
    const user: User =
      clientUser ??
      ({
        id: activeUserId,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: "",
      } as User);

    return (
      <UserCartSection
        user={user}
        initialCart={userCart}
        initialSizeConfigs={sizeConfigs}
        prefetchedProductIds={prefetchedProductIds}
      />
    );
  }

  return (
    <GuestCartSection
      initialCartItems={guestCartItems}
      initialProducts={guestCartProducts}
      initialSizeConfigs={sizeConfigs}
      prefetchedProductIds={prefetchedProductIds}
    />
  );
}

export default CartSection;
