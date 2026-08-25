"use client";

import { useMemo } from "react";
import { useQuery } from "@urql/next";
import { useAuth } from "@/providers/AuthProvider";
import { FetchCartQuery } from "../components/UserCartSection";
import useCartStore, { calcProductCountStorage } from "../useCartStore";

/** Single source for cart badge count (guest cookie cart + logged-in Supabase cart). */
export function useCartCount() {
  const { user } = useAuth();
  const cart = useCartStore((s) => s.cart);

  const guestCount = useMemo(() => calcProductCountStorage(cart), [cart]);

  const [{ data }] = useQuery({
    query: FetchCartQuery,
    variables: { userId: user?.id, first: 200 },
    pause: !user,
  });

  const authCount = useMemo(
    () =>
      (data?.cartsCollection?.edges ?? []).reduce(
        (acc, cur) => acc + cur.node.quantity,
        0,
      ),
    [data?.cartsCollection?.edges],
  );

  return user ? authCount : guestCount;
}
