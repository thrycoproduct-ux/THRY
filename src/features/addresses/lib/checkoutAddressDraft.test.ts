import {
  buildCartPincodeDefaults,
  clearCheckoutAddressDraft,
  loadCheckoutAddressDraft,
  mergeCheckoutAddressDefaults,
  saveCheckoutAddressDraft,
} from "./checkoutAddressDraft";

describe("buildCartPincodeDefaults", () => {
  it("returns empty when PIN is missing or incomplete", () => {
    expect(buildCartPincodeDefaults({})).toEqual({});
    expect(buildCartPincodeDefaults({ postal_code: "5600" })).toEqual({});
  });

  it("normalizes PIN and includes city/state when provided", () => {
    expect(
      buildCartPincodeDefaults({
        postal_code: "560 001",
        city: "Bengaluru",
        state: "Karnataka",
      }),
    ).toEqual({
      postal_code: "560001",
      city: "Bengaluru",
      state: "Karnataka",
    });
  });
});

describe("mergeCheckoutAddressDefaults", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    clearCheckoutAddressDraft();
  });

  it("prefers saved draft fields over incoming account defaults", () => {
    saveCheckoutAddressDraft({
      fullName: "Test User",
      email: "buyer@example.com",
      mobile: "9876543210",
      line1: "12 MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      postal_code: "560001",
    });

    expect(loadCheckoutAddressDraft()?.line1).toBe("12 MG Road");

    const merged = mergeCheckoutAddressDefaults({
      email: "other@example.com",
      postal_code: "560001",
      city: "Bengaluru",
      state: "Karnataka",
    });

    expect(merged.postal_code).toBe("560001");
    expect(merged.city).toBe("Bengaluru");
    expect(merged.state).toBe("Karnataka");
    expect(merged.line1).toBe("12 MG Road");
    expect(merged.mobile).toBe("9876543210");
    expect(merged.email).toBe("buyer@example.com");
  });
});
