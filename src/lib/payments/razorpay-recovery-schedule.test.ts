import {
  RAZORPAY_RECOVERY_RUN_INTERVAL_MS,
  isRazorpayRecoveryDue,
  razorpayRecoveryCheckIntervalMs,
} from "@/lib/payments/razorpay-recovery-schedule";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = Date.UTC(2026, 8, 27, 18, 0, 0);

function dueRunsInWindow(orderId: string, ageMs: number, windowMs: number) {
  let due = 0;
  for (let t = 0; t < windowMs; t += RAZORPAY_RECOVERY_RUN_INTERVAL_MS) {
    const nowMs = NOW + t;
    if (
      isRazorpayRecoveryDue({
        orderId,
        createdAt: new Date(nowMs - ageMs),
        nowMs,
      })
    ) {
      due += 1;
    }
  }
  return due;
}

describe("razorpayRecoveryCheckIntervalMs", () => {
  it("backs off as orders age", () => {
    expect(razorpayRecoveryCheckIntervalMs(30 * MINUTE)).toBe(0);
    expect(razorpayRecoveryCheckIntervalMs(5 * HOUR)).toBe(30 * MINUTE);
    expect(razorpayRecoveryCheckIntervalMs(48 * HOUR)).toBe(3 * HOUR);
    expect(razorpayRecoveryCheckIntervalMs(10 * 24 * HOUR)).toBe(12 * HOUR);
  });
});

describe("isRazorpayRecoveryDue", () => {
  it("checks fresh orders on every run", () => {
    expect(dueRunsInWindow("order-a", 20 * MINUTE, HOUR)).toBe(12);
  });

  it("checks 2-24h orders once per 30 minutes", () => {
    expect(dueRunsInWindow("order-b", 6 * HOUR, 3 * HOUR)).toBe(6);
  });

  it("checks 1-3 day orders once per 3 hours", () => {
    expect(dueRunsInWindow("order-c", 40 * HOUR, 12 * HOUR)).toBe(4);
  });

  it("checks old orders twice a day", () => {
    expect(dueRunsInWindow("order-d", 7 * 24 * HOUR, 24 * HOUR)).toBe(2);
  });

  it("spreads different orders across runs", () => {
    const slots = new Set<number>();
    for (let i = 0; i < 40; i += 1) {
      const orderId = `order-${i}`;
      for (let t = 0; t < 12 * HOUR; t += RAZORPAY_RECOVERY_RUN_INTERVAL_MS) {
        const nowMs = NOW + t;
        if (
          isRazorpayRecoveryDue({
            orderId,
            createdAt: new Date(nowMs - 7 * 24 * HOUR),
            nowMs,
          })
        ) {
          slots.add(t);
          break;
        }
      }
    }
    expect(slots.size).toBeGreaterThan(10);
  });

  it("treats an invalid createdAt as due", () => {
    expect(
      isRazorpayRecoveryDue({ orderId: "x", createdAt: "bad", nowMs: NOW }),
    ).toBe(true);
  });
});
