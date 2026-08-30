import { classifyCheckoutError } from "./checkout-outcome";

describe("classifyCheckoutError", () => {
  it("maps payment cancelled", () => {
    expect(classifyCheckoutError(new Error("Payment cancelled."))).toEqual({
      type: "payment_cancelled",
      reason: "Payment cancelled.",
    });
  });

  it("maps razorpay open timeout", () => {
    expect(
      classifyCheckoutError(
        new Error("Payment window did not open. Please retry checkout."),
      ),
    ).toEqual({
      type: "razorpay_open_timeout",
      reason: "Payment window did not open. Please retry checkout.",
    });
  });

  it("maps razorpay script failures", () => {
    expect(
      classifyCheckoutError(
        new Error(
          "Razorpay checkout script failed to load. Please retry checkout.",
        ),
      ),
    ).toEqual({
      type: "razorpay_script_failed",
      reason: "Razorpay checkout script failed to load. Please retry checkout.",
    });
  });

  it("maps payment failed", () => {
    expect(
      classifyCheckoutError(new Error("Razorpay payment failed.")),
    ).toEqual({
      type: "payment_failed",
      reason: "Razorpay payment failed.",
    });
  });
});
