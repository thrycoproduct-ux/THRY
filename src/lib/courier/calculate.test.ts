import {
  calculateCourierCharge,
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
