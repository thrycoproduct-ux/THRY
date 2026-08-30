import {
  CHECKOUT_FUNNEL_EVENT_TYPES,
  isCheckoutFunnelEventType,
} from "./checkout-funnel";

describe("checkout funnel events", () => {
  it("includes cart through payment stages", () => {
    expect(CHECKOUT_FUNNEL_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        "cart_view",
        "checkout_click",
        "checkout_pin_blocked",
        "checkout_address_open",
        "checkout_session_ok",
        "checkout_session_fail",
        "payment_open",
        "payment_cancel",
        "payment_paid",
      ]),
    );
  });

  it("type-guards known funnel events", () => {
    expect(isCheckoutFunnelEventType("checkout_click")).toBe(true);
    expect(isCheckoutFunnelEventType("not_a_real_event")).toBe(false);
  });
});
