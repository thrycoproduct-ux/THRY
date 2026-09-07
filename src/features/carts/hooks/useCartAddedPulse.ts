"use client";

import { useEffect, useState } from "react";
import { CART_ADDED_EVENT } from "@/features/carts/added-to-cart-toast";

/** Brief pulse on cart icons after add-to-cart (desktop bag + mobile tab). */
export function useCartAddedPulse(ms = 900) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const onAdded = () => {
      setPulse(true);
      window.setTimeout(() => setPulse(false), ms);
    };
    window.addEventListener(CART_ADDED_EVENT, onAdded);
    return () => window.removeEventListener(CART_ADDED_EVENT, onAdded);
  }, [ms]);

  return pulse;
}
