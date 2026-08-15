"use client";

import { useCallback, useState } from "react";
import type { CheckoutProgressUpdate } from "@/features/checkout/checkout-progress";
import CheckoutProgressOverlay from "@/features/checkout/components/CheckoutProgressOverlay";

export function useCheckoutProgress() {
  const [progress, setProgress] = useState<CheckoutProgressUpdate | null>(null);

  const beginProgress = useCallback((update: CheckoutProgressUpdate) => {
    setProgress(update);
  }, []);

  const clearProgress = useCallback(() => {
    setProgress(null);
  }, []);

  const isLocked = Boolean(progress);

  return {
    progress,
    isLocked,
    beginProgress,
    clearProgress,
    setProgress,
    overlay:
      progress && !progress.suppressOverlay ? (
        <CheckoutProgressOverlay open {...progress} />
      ) : null,
  };
}
