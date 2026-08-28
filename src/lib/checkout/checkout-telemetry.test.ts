import { describe, expect, it } from "vitest";
import {
  classifyCheckoutError,
  resolveCheckoutOutcome,
} from "./checkout-outcome";

describe("classifyCheckoutError", () => {
  it("maps payment cancelled", () => {
    expect(classifyCheckoutError(new Error("Payment cancelled."))).toEqual({
      type: "payment_cancelled",
      reason: "Payment cancelled.",
    });
  });

  it("maps razorpay script failures", () => {
    expect(
      classifyCheckoutError(
        new Error("Razorpay checkout script failed to load. Please retry checkout."),
      ),
    ).toEqual({
      type: "razorpay_script_failed",
      reason:
        "Razorpay checkout script failed to load. Please retry checkout.",
    });
  });

  it("maps verify failures", () => {
    expect(
      classifyCheckoutError(new Error("Could not confirm Razorpay payment.")),
    ).toEqual({
      type: "verify_failed",
      reason: "Could not confirm Razorpay payment.",
    });
  });
});

describe("resolveCheckoutOutcome", () => {
  it("returns null for paid orders", () => {
    expect(
      resolveCheckoutOutcome({
        paymentStatus: "paid",
        paymentMeta: {},
      }),
    ).toBeNull();
  });

  it("prefers checkout telemetry", () => {
    expect(
      resolveCheckoutOutcome({
        paymentStatus: "unpaid",
        paymentMeta: {
          checkoutTelemetry: {
            lastEvent: "payment_cancelled",
            lastReason: "Payment cancelled.",
            lastAt: "2026-08-28T00:00:00.000Z",
            events: [],
          },
        },
      }),
    ).toMatchObject({
      kind: "payment_cancelled",
      label: "Cancelled",
    });
  });

  it("falls back to razorpay failed sync meta", () => {
    expect(
      resolveCheckoutOutcome({
        paymentStatus: "unpaid",
        paymentMeta: {
          razorpayPaymentStatus: "failed",
          razorpayFailureReason: "Payment was unsuccessful",
        },
      }),
    ).toMatchObject({
      kind: "payment_failed",
      detail: "Payment was unsuccessful",
    });
  });

  it("falls back to abandoned razorpay created state", () => {
    expect(
      resolveCheckoutOutcome({
        paymentStatus: "unpaid",
        paymentMeta: {
          razorpayOrderStatus: "created",
        },
      }),
    ).toMatchObject({
      kind: "abandoned",
      label: "Abandoned",
    });
  });
});
