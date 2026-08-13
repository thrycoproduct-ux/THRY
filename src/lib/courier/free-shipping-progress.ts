import type { CourierChargesConfig } from "@/lib/courier/calculate";

export type FreeShippingProgress = {
  threshold: number;
  orderAmount: number;
  remaining: number;
  /** 0..1 fill ratio toward free shipping. */
  progress: number;
  unlocked: boolean;
};

/** Cart nudge math — null when free shipping progress should be hidden. */
export function getFreeShippingProgress(params: {
  orderAmount: number;
  config: Pick<
    CourierChargesConfig,
    "enabled" | "freeShippingEnabled" | "freeShippingMin"
  >;
}): FreeShippingProgress | null {
  const config = params.config;
  if (!config.enabled || !config.freeShippingEnabled) return null;

  const threshold = Math.max(
    0,
    Math.round(Number(config.freeShippingMin) || 0),
  );
  if (threshold <= 0) return null;

  const rawAmount = Number(params.orderAmount);
  const orderAmount = Number.isFinite(rawAmount) ? Math.max(0, rawAmount) : 0;
  const remaining = Math.max(
    0,
    Math.round((threshold - orderAmount) * 100) / 100,
  );
  const unlocked = orderAmount >= threshold;
  const progress = Math.min(1, Math.max(0, orderAmount / threshold));

  return {
    threshold,
    orderAmount,
    remaining,
    progress,
    unlocked,
  };
}
