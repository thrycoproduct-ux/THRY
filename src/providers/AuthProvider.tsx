"use client";

import useCartStore from "@/features/carts/useCartStore";
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
import { clearPersistedCartStorage } from "@/features/carts/clear-persisted-cart";
import {
  cartHasLines,
  decideGuestCartMerge,
} from "@/features/carts/guest-cart-merge";
import type { AuthUser, Session, SupabaseClient } from "@supabase/supabase-js";
import { useToast } from "@/components/ui/use-toast";
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

function markGuestCartMergedForUser(userId: string) {
  try {
    sessionStorage.setItem(MERGED_GUEST_CART_KEY, userId);
  } catch {
    // Ignore storage access failures (private mode/restrictions).
  }
}

function applyDbCartToCookie(
  dbRows: Array<{
    product_id?: string | null;
    quantity?: number | null;
    size?: string | null;
    selections?: Record<string, string> | null;
  }>,
) {
  const mapped = dbRows.map((row) => ({
    product_id: String(row.product_id ?? ""),
    quantity: Number(row.quantity ?? 0),
    size: row.size ?? null,
    selections: row.selections ?? null,
  }));
  const dbHasLines = mapped.some((row) => row.quantity > 0);
  if (dbHasLines) {
    useCartStore.getState().replaceCart(dbCartRowsToCartItems(mapped));
    return;
  }
  useCartStore.getState().replaceCart({});
  clearPersistedCartStorage();
  useCartStore.getState().replaceCart({});
}

async function mergeGuestCookieIntoDb(args: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const cart = readClientCartCookie();
  if (!cart || typeof cart !== "object") return;

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
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (entries.length === 0) return;

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
      user_id: args.userId,
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

  if (storageCarts.length === 0) return;

  await args.supabase.from("carts").upsert(storageCarts, {
    onConflict: "user_id,product_id,variant_key",
  });
  useCartStore.getState().replaceCart(dbCartRowsToCartItems(storageCarts));
}

async function syncAuthCartOnAuthEvent(args: {
  supabase: SupabaseClient;
  userId: string;
  authEvent: string;
  sawLoggedOutInThisRuntime: boolean;
}) {
  const { data: dbRows, error: dbErr } = await args.supabase
    .from("carts")
    .select("product_id,quantity,size,selections")
    .eq("user_id", args.userId);

  if (dbErr) {
    markGuestCartMergedForUser(args.userId);
    return;
  }

  const rows = dbRows ?? [];
  const action = decideGuestCartMerge({
    authEvent: args.authEvent,
    sawLoggedOutInThisRuntime: args.sawLoggedOutInThisRuntime,
    dbHasLines: rows.some((row) => Number(row.quantity ?? 0) > 0),
    cookieHasLines: cartHasLines(readClientCartCookie()),
    authCartCleared: hasAuthCartClearedForUser(args.userId),
  });

  markGuestCartMergedForUser(args.userId);

  try {
    if (action === "merge_cookie_to_db") {
      await mergeGuestCookieIntoDb({
        supabase: args.supabase,
        userId: args.userId,
      });
      return;
    }

    applyDbCartToCookie(rows);
  } catch {
    applyDbCartToCookie(rows);
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
  const sawLoggedOutInThisRuntimeRef = useRef(false);

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
            supabase.auth.getUser().then(async ({ data }) => {
              setUser(data.user);
              if (!data.user?.id) {
                sawLoggedOutInThisRuntimeRef.current = true;
                return;
              }

              loadWishlistForUser(data.user.id);
              await syncAuthCartOnAuthEvent({
                supabase,
                userId: data.user.id,
                authEvent: "INITIAL_SESSION",
                sawLoggedOutInThisRuntime:
                  sawLoggedOutInThisRuntimeRef.current,
              });
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

              if (!data.user) {
                sawLoggedOutInThisRuntimeRef.current = true;
                return;
              }

              void syncAuthCartOnAuthEvent({
                supabase,
                userId: data.user.id,
                authEvent: "SIGNED_IN",
                sawLoggedOutInThisRuntime:
                  sawLoggedOutInThisRuntimeRef.current,
              });
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
            sawLoggedOutInThisRuntimeRef.current = true;
            clearWelcomedInSession();
            clearMergedGuestCartMarker();
            clearAuthCartClearedMarker();
            removeAllCartStorage();
            clearPersistedCartStorage();
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
