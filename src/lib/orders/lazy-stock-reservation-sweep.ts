import {
  getIntegrationSetting,
  INTEGRATION_KEYS,
} from "@/lib/integrations/settings";
import { releaseExpiredStockReservations } from "@/lib/orders/stock-reservation";
import { withRetry } from "@/lib/resilience";
import {
  getLastLazyStockSweepAtMs,
  markLazyStockSweepRan,
  shouldRunLazyStockSweep,
} from "@/lib/orders/lazy-stock-reservation-sweep-policy";

export {
  LAZY_STOCK_SWEEP_MIN_INTERVAL_MS,
  resetLazyStockSweepThrottleForTests,
  shouldRunLazyStockSweep,
} from "@/lib/orders/lazy-stock-reservation-sweep-policy";

export type LazyStockReservationSweepResult = {
  ran: boolean;
  skippedReason?: "stock_control_disabled" | "throttled";
  scanned?: number;
  released?: number;
  failed?: number;
  error?: string;
};

export async function sweepExpiredStockReservationsIfEnabled(options?: {
  force?: boolean;
  lookbackHours?: number;
  limit?: number;
  stockControlEnabled?: boolean;
  nowMs?: number;
}): Promise<LazyStockReservationSweepResult> {
  let stockControlEnabled = options?.stockControlEnabled;
  if (stockControlEnabled === undefined) {
    const setting = await getIntegrationSetting(INTEGRATION_KEYS.stockControl);
    stockControlEnabled = Boolean(setting?.isEnabled);
  }

  if (!stockControlEnabled) {
    return { ran: false, skippedReason: "stock_control_disabled" };
  }

  const nowMs = options?.nowMs ?? Date.now();
  if (
    !shouldRunLazyStockSweep(
      getLastLazyStockSweepAtMs(),
      nowMs,
      Boolean(options?.force),
    )
  ) {
    return { ran: false, skippedReason: "throttled" };
  }

  markLazyStockSweepRan(nowMs);

  try {
    const result = await withRetry(
      () =>
        releaseExpiredStockReservations({
          lookbackHours: options?.lookbackHours ?? 168,
          limit: options?.limit ?? 100,
        }),
      { label: "stock:lazy-sweep", attempts: 3 },
    );

    if (result.released > 0) {
      console.info(
        `[stock-reservation] lazy sweep released ${result.released} expired hold(s)`,
      );
    }
    if (result.failed > 0) {
      console.warn(
        `[stock-reservation] lazy sweep could not release ${result.failed} hold(s)`,
      );
    }

    return {
      ran: true,
      scanned: result.scanned,
      released: result.released,
      failed: result.failed,
    };
  } catch (error) {
    console.error("[stock-reservation] lazy sweep failed:", error);
    return {
      ran: true,
      error: error instanceof Error ? error.message : "lazy sweep failed",
    };
  }
}
