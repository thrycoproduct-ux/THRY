import { formatCheckoutErrorMessage } from "./format-checkout-error";

describe("formatCheckoutErrorMessage", () => {
  it("maps Razorpay domain allowlist failures", () => {
    expect(
      formatCheckoutErrorMessage(
        new Error(
          "Payment blocked as website does not match registered website(s)",
        ),
      ),
    ).toMatch(/store domain/i);
  });

  it("maps Razorpay script load failures", () => {
    expect(
      formatCheckoutErrorMessage(
        new Error(
          "Razorpay checkout script failed to load. Please retry checkout.",
        ),
      ),
    ).toMatch(/could not load/i);
  });

  it("maps payment window open failures", () => {
    expect(
      formatCheckoutErrorMessage(
        new Error("Payment window did not open. Please retry checkout."),
      ),
    ).toMatch(/did not open/i);
  });

  it("passes through other messages", () => {
    expect(formatCheckoutErrorMessage(new Error("Cart is empty"))).toBe(
      "Cart is empty",
    );
  });

  it("falls back for empty errors", () => {
    expect(formatCheckoutErrorMessage("")).toBe("Please try again.");
  });
});
