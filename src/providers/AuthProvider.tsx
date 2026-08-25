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
import { useToast } from "@/components/ui/use-toast";
import { AuthUser, Session } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
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

function hasWelcomedInSession(userId: string) {
  try {
    return sessionStorage.getItem(WELCOME_TOAST_KEY) === userId;
  } catch {
    return false;
  }
}

function markWelcomedInSession(userId: string) {
  try {
    sessionStorage.setItem(WELCOME_TOAST_KEY, userId);
  } catch {
    // Ignore storage access failures (private mode/restrictions).
  }
}

function clearWelcomedInSession() {
  try {
    sessionStorage.removeItem(WELCOME_TOAST_KEY);
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
            supabase.auth.getUser().then(({ data }) => {
              setUser(data.user);
              if (data.user?.id) {
                loadWishlistForUser(data.user.id);
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

              try {
                const raw = localStorage.getItem("cart");
                if (raw) {
                  const parsed = JSON.parse(raw) as { cart?: CartItems };
                  const cart = parsed?.cart;
                  if (cart && typeof cart === "object") {
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
                        (
                          row,
                        ): row is NonNullable<typeof row> => row !== null,
                      );

                    void (async () => {
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
                          id: nanoid(),
                          product_id: row.productId,
                          user_id: data.user!.id,
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

                      if (storageCarts.length > 0) {
                        await supabase.from("carts").insert(storageCarts);
                      }
                    })();
                  }
                }
              } catch {
                // Ignore invalid guest cart payload in localStorage.
              }
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
            clearWelcomedInSession();
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
