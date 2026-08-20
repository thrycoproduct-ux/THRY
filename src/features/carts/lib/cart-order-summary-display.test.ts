import {
  formatCartGstLabel,
  shouldShowCartDiscountRows,
} from "./cart-order-summary-display";

describe("shouldShowCartDiscountRows", () => {
  it("hides when discount is zero and no promo percent", () => {
    expect(
      shouldShowCartDiscountRows({ discountAmount: 0, promoPercentage: 0 }),
    ).toBe(false);
  });

  it("shows when discount amount is positive", () => {
    expect(
      shouldShowCartDiscountRows({ discountAmount: 50, promoPercentage: 0 }),
    ).toBe(true);
  });

  it("shows when promo percentage is positive", () => {
    expect(
      shouldShowCartDiscountRows({ discountAmount: 0, promoPercentage: 5 }),
    ).toBe(true);
  });
});

describe("formatCartGstLabel", () => {
  it("includes percentage when GST is enabled", () => {
    expect(
      formatCartGstLabel({ gstEnabled: true, gstPercentage: 18 }),
    ).toBe("GST (18%)");
  });

  it("keeps plain GST when disabled or rate is zero", () => {
    expect(
      formatCartGstLabel({ gstEnabled: false, gstPercentage: 18 }),
    ).toBe("GST");
    expect(formatCartGstLabel({ gstEnabled: true, gstPercentage: 0 })).toBe(
      "GST",
    );
  });

  it("preserves fractional rates", () => {
    expect(
      formatCartGstLabel({ gstEnabled: true, gstPercentage: 12.5 }),
    ).toBe("GST (12.5%)");
  });
});
