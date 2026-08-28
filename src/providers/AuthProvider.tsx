"use client";

import useCartStore, { type CartItems } from "@/features/carts/useCartStore";
import {
  buildCartVariantKey,
  extractProductIdFromCartLineKey,
} from "@/features/carts/cart-line";
import {
  fetchCartSizeConfigsByProductIds,
  shouldBlockBareCartAdd,
} from "@/features/carts/cart-options-guard";
import { dbCartRowsToCartItems } from "@/features/carts/cart-storage-sync";
import { readClientCartCookie } from "@/features/carts/read-client-cart-cookie";
import {
  clearAuthCartClearedMarker,
  hasAuthCartClearedForUser,
} from "@/features/carts/cart-cleared-marker";
import { useToast } from "@/components/ui/use-toast";
import { AuthUser, Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import useWishlistStore from "@/features/wishlists/useWishlistStore";

type SupabaseAuthContextType = {
  user: AuthUser | null;
  session: Session | null;
};

const SupabaseAuthContext = createContext<SupabaseAuthContextType>({
  user: null,
  session: null,
});

export const useAuth = () => {
  const client = useContext(SupabaseAuthContext);
  return client;
};

interface SupabaseAuthProviderProps {
  children: React.ReactNode;
}

const WELCOME_TOAST_KEY = "auth:welcomed-user-id";
const MERGED_GUEST_CART_KEY = "auth:merged-guest-cart-user-id";

function hasWelcomedInSession(userId: string) {
  try {
    return sessionStorage.getItem(WELCOME_TOAST_KEY) === userId;
  } catch {
    return false;
  }
}

function clearWelcomedInSession() {
  try {
    sessionStorage.removeItem(WELCOME_TOAST_KEY);
  } catch {
    // Ignore storage access failures (private mode/restrictions).
  }
}

function markWelcomedInSession(userId: string) {
  try {
    sessionStorage.setItem(WELCOME_TOAST_KEY, userId);
  } catch {
    // Ignore storage access failures (private mode/restrictions).
  }
}

function clearMergedGuestCartMarker() {
  try {
    sessionStorage.removeItem(MERGED_GUEST_CART_KEY);
  } catch {
    // Ignore storage access failures (private mode/restrictions).
  }
}

function hasMergedGuestCartForUser(userId: string) {
  try {
    return sessionStorage.getItem(MERGED_GUEST_CART_KEY) === userId;
  } catch {
    return false;
  }
}

function markGuestCartMergedForUser(userId: string) {
  try {
    sessionStorage.setItem(MERGED_GUEST_CART_KEY, userId);
  } catch {
    // Ignore storage access failures (private mode/restrictions).
  }
}

export const SupabaseAuthProvider: React.FC<SupabaseAuthProviderProps> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const removeAllCartStorage = useCartStore((s) => s.removeAllProducts);
  const setWishlist = useWishlistStore((s) => s.setWishlist);
  const { toast } = useToast();
  const router = useRouter();
  const lastWelcomedUserId = useRef<string | null>(null);
  const sessionEstablishedRef = useRef(false);

  const loadWishlistForUser = (userId: string) => {
    const supabase = createClient();
    supabase
      .from("wishlist")
      .select()
      .eq("user_id", userId)
      .then((data) => {
        const wishlistItems: Parameters<typeof setWishlist>[0] = {};

        data?.data?.forEach((item) => {
          wishlistItems[item.product_id] = {
            createdAt: new Date(item.created_at),
            updatedAt: new Date(item.created_at),
          };
        });

        setWishlist(wishlistItems);
      });
  };

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    try {
      const supabase = createClient();
      const authChange = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);

        switch (_event) {
          case "INITIAL_SESSION":
            sessionEstablishedRef.current = true;
            supabase.auth.getUser().then(async ({ data }) => {
              setUser(data.user);
              if (!data.user?.id) return;

              const userId = data.user.id;
              markGuestCartMergedForUser(userId);
              loadWishlistForUser(userId);

              const { data: dbRows, error: dbErr } = await supabase
                .from("carts")
                .select("product_id,quantity,size,selections")
                .eq("user_id", userId);

              if (dbErr) return;

              const dbHasLines = (dbRows ?? []).some(
                (row) => Number(row.quantity ?? 0) > 0,
              );
              if (dbHasLines) {
                useCartStore
                  .getState()
                  .replaceCart(dbCartRowsToCartItems(dbRows ?? []));
              } else {
                useCartStore.getState().replaceCart({});
              }
            });
            break;
          case "PASSWORD_RECOVERY":
            supabase.auth.getUser().then(({ data }) => {
              setUser(data.user);
            });
            if (
              typeof window !== "undefined" &&
              !window.location.pathname.startsWith("/reset-password")
            ) {
              router.push("/reset-password");
            }
            break;

          case "SIGNED_IN":
            supabase.auth.getUser().then(({ data }) => {
              setUser(data.user);

              if (!data.user) return;

              void (async () => {
                const userId = data.user!.id;
                const { data: dbRows, error: dbErr } = await supabase
                  .from("carts")
                  .select("product_id,quantity,size,selections")
                  .eq("user_id", userId);

                if (dbErr) {
                  markGuestCartMergedForUser(userId);
                  return;
                }

                const dbHasLines = (dbRows ?? []).some(
                  (row) => Number(row.quantity ?? 0) > 0,
                );

                if (hasAuthCartClearedForUser(userId)) {
                  markGuestCartMergedForUser(userId);
                  useCartStore.getState().replaceCart({});
                  return;
                }

                // Returning session: DB is source of truth — never push stale cookie back into DB.
                if (sessionEstablishedRef.current || dbHasLines) {
                  markGuestCartMergedForUser(userId);
                  if (dbHasLines) {
                    useCartStore
                      .getState()
                      .replaceCart(dbCartRowsToCartItems(dbRows ?? []));
                  } else {
                    useCartStore.getState().replaceCart({});
                  }
                  return;
                }

                if (hasMergedGuestCartForUser(userId)) return;

                try {
                  const cart = readClientCartCookie();
                  if (!cart || typeof cart !== "object") {
                    markGuestCartMergedForUser(userId);
                    return;
                  }

                  const entries = Object.entries(cart)
                    .map(([lineKey, productValue]) => {
                      const productId = extractProductIdFromCartLineKey(
                        lineKey,
                        productValue.productId,
                      );
                      if (!productId) return null;

                      const quantity = Number(productValue.quantity ?? 0);
                      if (!Number.isFinite(quantity) || quantity <= 0) {
                        return null;
                      }

                      return {
                        lineKey,
                        productId,
                        productValue,
                        quantity,
                      };
                    })
                    .filter(
                      (row): row is NonNullable<typeof row> => row !== null,
                    );

                  if (entries.length === 0) {
                    markGuestCartMergedForUser(userId);
                    return;
                  }

                  const configs = await fetchCartSizeConfigsByProductIds(
                    entries.map((row) => row.productId),
                  );
                  const storageCarts = entries
                    .filter(
                      (row) =>
                        !shouldBlockBareCartAdd({
                          sizeConfig: configs[row.productId],
                          selections: row.productValue.selections,
                          size: row.productValue.size,
                        }),
                    )
                    .map((row) => ({
                      product_id: row.productId,
                      user_id: userId,
                      quantity: row.quantity,
                      variant_key:
                        row.productValue.variantKey ??
                        buildCartVariantKey({
                          size: row.productValue.size,
                          selections: row.productValue.selections,
                        }),
                      size: row.productValue.size ?? null,
                      selections: row.productValue.selections ?? null,
                    }));

                  markGuestCartMergedForUser(userId);
                  if (storageCarts.length > 0) {
                    await supabase.from("carts").upsert(storageCarts, {
                      onConflict: "user_id,product_id,variant_key",
                    });
                    useCartStore
                      .getState()
                      .replaceCart(dbCartRowsToCartItems(storageCarts));
                  }
                } catch {
                  markGuestCartMergedForUser(userId);
                }
              })();
            });

            if (session?.user?.id) {
              loadWishlistForUser(session.user.id);
            }

            if (
              session?.user?.id &&
              session.user.id !== lastWelcomedUserId.current &&
              !hasWelcomedInSession(session.user.id)
            ) {
              lastWelcomedUserId.current = session.user.id;
              markWelcomedInSession(session.user.id);
              toast({
                title: "Welcome back.",
                description: "You are already signed in.",
              });
            }
            break;
          case "SIGNED_OUT":
            setUser(null);
            lastWelcomedUserId.current = null;
            sessionEstablishedRef.current = false;
            clearWelcomedInSession();
            clearMergedGuestCartMarker();
            clearAuthCartClearedMarker();
            removeAllCartStorage();
            break;

          case "TOKEN_REFRESHED":
          case "USER_UPDATED":
          case "MFA_CHALLENGE_VERIFIED":
            supabase.auth.getUser().then(({ data }) => {
              setUser(data.user);
            });
            break;
        }
      });

      subscription = authChange.data.subscription;
    } catch (error) {
      console.error("[auth] Failed to initialize client auth provider", error);
      setUser(null);
      setSession(null);
    }

    return () => subscription?.unsubscribe();
  }, [removeAllCartStorage, router, setWishlist, toast]);

  return (
    <SupabaseAuthContext.Provider value={{ user, session }}>
      {children}
    </SupabaseAuthContext.Provider>
  );
};
