import {
  recoverUnpaidRazorpayOrders,
  repairPaidRazorpaySideEffects,
} from "@/lib/payments/recover-unpaid-razorpay-orders";

const MIN_INTERVAL_MS = 90_000;
let lastRanAtMs = 0;

export function resetLazyRazorpayRecoveryThrottleForTests() {
  lastRanAtMs = 0;
}

/**
 * Best-effort Razorpay unpaid recovery while admin is looking at orders.
 * Throttled so page loads stay fast; compensates for missing Vercel Pro crons.
 */
export async function runLazyRazorpayPaymentRecovery(options?: {
  force?: boolean;
  nowMs?: number;
}): Promise<{ ran: boolean; skippedReason?: "throttled"; error?: string }> {
  const nowMs = options?.nowMs ?? Date.now();
  if (!options?.force && nowMs - lastRanAtMs < MIN_INTERVAL_MS) {
    return { ran: false, skippedReason: "throttled" };
  }
  lastRanAtMs = nowMs;

  try {
    const recovered = await recoverUnpaidRazorpayOrders({
      lookbackDays: 7,
      limit: 15,
    });
    const repaired = await repairPaidRazorpaySideEffects({
      lookbackDays: 7,
      limit: 10,
    });
    if (recovered.syncedPaid > 0 || repaired.repaired > 0) {
      console.info(
        `[razorpay] lazy recovery syncedPaid=${recovered.syncedPaid} repaired=${repaired.repaired}`,
      );
    }
    return { ran: true };
  } catch (error) {
    console.error("[razorpay] lazy recovery failed:", error);
    return {
      ran: true,
      error: error instanceof Error ? error.message : "lazy recovery failed",
    };
  }
}
