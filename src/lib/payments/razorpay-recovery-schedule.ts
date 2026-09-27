const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Cadence of `/api/cron/recover-unpaid-razorpay` (vercel.json: every 5 min). */
export const RAZORPAY_RECOVERY_RUN_INTERVAL_MS = 5 * MINUTE_MS;

/**
 * How often an unpaid order is re-checked with Razorpay, by order age.
 * Fresh checkouts are where missed webhooks matter; old abandoned ones only
 * need an occasional late-capture check.
 */
export function razorpayRecoveryCheckIntervalMs(orderAgeMs: number): number {
  if (orderAgeMs < 2 * HOUR_MS) return 0;
  if (orderAgeMs < 24 * HOUR_MS) return 30 * MINUTE_MS;
  if (orderAgeMs < 72 * HOUR_MS) return 3 * HOUR_MS;
  return 12 * HOUR_MS;
}

function stableOffsetMs(orderId: string, intervalMs: number): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < orderId.length; index += 1) {
    hash = Math.imul(hash ^ orderId.charCodeAt(index), 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return Math.floor((hash / 0x1_0000_0000) * intervalMs);
}

/**
 * Stateless due check: each order owns one run-sized slot per interval, offset
 * by its id so checks spread across runs. Assumes the caller runs every
 * `runIntervalMs`; cron jitter can occasionally skip or repeat one slot.
 */
export function isRazorpayRecoveryDue(params: {
  orderId: string;
  createdAt: Date | string;
  nowMs: number;
  runIntervalMs?: number;
}): boolean {
  const runIntervalMs =
    params.runIntervalMs ?? RAZORPAY_RECOVERY_RUN_INTERVAL_MS;
  const createdAtMs = new Date(params.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return true;

  const intervalMs = razorpayRecoveryCheckIntervalMs(
    params.nowMs - createdAtMs,
  );
  if (intervalMs <= runIntervalMs) return true;

  const slot =
    (params.nowMs + stableOffsetMs(params.orderId, intervalMs)) % intervalMs;
  return slot < runIntervalMs;
}
