"use client";

import { useMemo } from "react";
import useCartStore, { calcProductCountStorage } from "../useCartStore";

/** Cart badge count — cookie store synced from Supabase for logged-in users. */
export function useCartCount() {
  const cart = useCartStore((s) => s.cart);
  return useMemo(() => calcProductCountStorage(cart), [cart]);
}
