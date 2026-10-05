import {
  calculateCourierCharge,
  calculateGstAmount,
  getGstInclusiveFactor,
  toGstInclusiveAmount,
  buildCheckoutMoneyTotals,
  normalizeWeightSlabs,
  parseCourierWeightSettings,
  physicalWeightForShipping,
  type CourierChargesConfig,
} from "@/lib/courier/calculate";

const baseConfig: CourierChargesConfig = {
  enabled: true,
  tamilNaduBase: 80,
  southStatesBase: 120,
  restOfIndiaBase: 120,
  qty2To4AddOn: 0,
  qty5PlusFlat: 120,
  freeShippingEnabled: false,
  freeShippingMin: 999,
  gstEnabled: false,
  gstPercentage: 0,
};

describe("calculateCourierCharge free shipping", () => {
  it("charges nothing when there are no physical items", () => {
    const result = calculateCourierCharge({
      state: "Tamil Nadu",
      quantity: 0,
      orderAmount: 1500,
      config: baseConfig,
    });
    expect(result.charge).toBe(0);
    expect(result.ruleApplied).toBe("no_physical_items");
  });

  it("uses normal slab when free shipping is disabled even above threshold", () => {
    const result = calculateCourierCharge({
      state: "Tamil Nadu",
      quantity: 1,
      orderAmount: 1500,
      config: baseConfig,
    });
    expect(result.charge).toBe(80);
    expect(result.ruleApplied).toBe("qty1_base");
  });

  it("applies free shipping at or above threshold when enabled", () => {
    const config = { ...baseConfig, freeShippingEnabled: true };
    const at = calculateCourierCharge({
      state: "Karnataka",
      quantity: 2,
      orderAmount: 999,
      config,
    });
    expect(at.charge).toBe(0);
    expect(at.ruleApplied).toBe("free_shipping");
    expect(at.region).toBe("south_states");

    const above = calculateCourierCharge({
      state: "Delhi",
      quantity: 5,
      orderAmount: 2000,
      config,
    });
    expect(above.charge).toBe(0);
    expect(above.ruleApplied).toBe("free_shipping");
  });

  it("keeps slab charge below threshold when free shipping is enabled", () => {
    const result = calculateCourierCharge({
      state: "Tamil Nadu",
      quantity: 1,
      orderAmount: 998,
      config: { ...baseConfig, freeShippingEnabled: true },
    });
    expect(result.charge).toBe(80);
    expect(result.ruleApplied).toBe("qty1_base");
  });

  it("treats missing orderAmount as not free shipping", () => {
    const result = calculateCourierCharge({
      state: "Kerala",
      quantity: 1,
      config: { ...baseConfig, freeShippingEnabled: true },
    });
    expect(result.charge).toBe(120);
    expect(result.ruleApplied).toBe("qty1_base");
  });
});

describe("GST inclusive display helpers", () => {
  const gstOn: CourierChargesConfig = {
    ...baseConfig,
    gstEnabled: true,
    gstPercentage: 18,
  };

  it("returns factor 1 when GST is off", () => {
    expect(getGstInclusiveFactor(baseConfig)).toBe(1);
    expect(toGstInclusiveAmount(1000, baseConfig)).toBe(1000);
  });

  it("bumps exclusive prices by GST % for storefront display", () => {
    expect(getGstInclusiveFactor(gstOn)).toBe(1.18);
    expect(toGstInclusiveAmount(1000, gstOn)).toBe(1180);
    expect(toGstInclusiveAmount(999, gstOn)).toBe(1178.82);
  });

  it("buildCheckoutMoneyTotals matches exclusive + courier + gst once", () => {
    const money = buildCheckoutMoneyTotals({
      exclusiveMerchandise: 1000,
      courierCharge: 80,
      config: gstOn,
    });
    const expectedGst = calculateGstAmount({
      taxableAmount: 1080,
      config: gstOn,
    });
    expect(money.gstAmount).toBe(expectedGst);
    expect(money.total).toBe(1000 + 80 + expectedGst);
    expect(money.displayMerchandise).toBe(1180);
    expect(money.displayCourier).toBe(toGstInclusiveAmount(80, gstOn));
    // Inclusive display rows must not be used as a second GST base.
    expect(money.total).not.toBe(
      money.displayMerchandise + money.displayCourier + money.gstAmount,
    );
  });

  it("when GST off, display amounts equal exclusive and gst is 0", () => {
    const money = buildCheckoutMoneyTotals({
      exclusiveMerchandise: 500,
      courierCharge: 40,
      config: baseConfig,
    });
    expect(money.gstAmount).toBe(0);
    expect(money.total).toBe(540);
    expect(money.displayMerchandise).toBe(500);
    expect(money.displayCourier).toBe(40);
  });
});

describe("weight-wise courier", () => {
  const weightConfig: CourierChargesConfig = {
    ...baseConfig,
    calculationMode: "weight",
    weightSlabs: [
      { upToKg: 2, tamilNadu: 70, southStates: 100, restOfIndia: 120 },
      { upToKg: 1, tamilNadu: 40, southStates: 60, restOfIndia: 75 },
    ],
    weightExtraPerKg: 30,
  };
  const charge = (state: string, weightKg: number) =>
    calculateCourierCharge({
      state,
      quantity: 1,
      weightKg,
      config: weightConfig,
    });

  it("picks the first slab covering the weight, per region", () => {
    expect(charge("Tamil Nadu", 0.5).charge).toBe(40);
    expect(charge("Tamil Nadu", 1).charge).toBe(40);
    expect(charge("Kerala", 1.2).charge).toBe(100);
    expect(charge("Delhi", 2).charge).toBe(120);
    expect(charge("Delhi", 2).ruleApplied).toBe("weight_slab");
  });

  it("adds extra per started kg above the last slab", () => {
    const result = charge("Tamil Nadu", 3.2);
    expect(result.ruleApplied).toBe("weight_over_max");
    expect(result.charge).toBe(70 + 2 * 30);
  });

  it("still honours free shipping and no physical items", () => {
    expect(
      calculateCourierCharge({
        state: "Tamil Nadu",
        quantity: 1,
        weightKg: 3,
        orderAmount: 1500,
        config: {
          ...weightConfig,
          freeShippingEnabled: true,
          freeShippingMin: 999,
        },
      }).ruleApplied,
    ).toBe("free_shipping");
    expect(
      calculateCourierCharge({
        state: "Tamil Nadu",
        quantity: 0,
        weightKg: 0,
        config: weightConfig,
      }).charge,
    ).toBe(0);
  });

  it("sums weight × qty for physical lines with 0.5 kg default", () => {
    expect(
      physicalWeightForShipping([
        { quantity: 2, weightKg: "1.250" },
        { quantity: 3, weightKg: null },
        { quantity: 5, weightKg: 9, isDigital: true },
      ]),
    ).toBe(4);
  });

  it("parses settings with safe defaults", () => {
    const parsed = parseCourierWeightSettings({});
    expect(parsed.calculationMode).toBe("quantity");
    expect(parsed.weightSlabs.length).toBeGreaterThan(0);
    expect(
      normalizeWeightSlabs([{ upToKg: 0 }, { upToKg: "abc" }]).length,
    ).toBeGreaterThan(0);
  });
});
