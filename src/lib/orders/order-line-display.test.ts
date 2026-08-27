import {
  formatOrderLineVariant,
  resolveOrderLineImageKey,
  resolveOrderLineProductCode,
  resolveOrderLineProductName,
} from "@/lib/orders/order-line-display";

describe("order-line-display", () => {
  it("prefers live product fields then snapshots", () => {
    expect(
      resolveOrderLineProductName({
        productName: "Live name",
        productNameSnapshot: "Saved name",
      }),
    ).toBe("Live name");

    expect(
      resolveOrderLineProductName({
        productName: null,
        productNameSnapshot: "Saved name",
      }),
    ).toBe("Saved name");
  });

  it("resolves image key and product code from snapshots", () => {
    expect(
      resolveOrderLineImageKey({
        imageKey: null,
        productImageKeySnapshot: "sakthi/product-1.webp",
      }),
    ).toBe("sakthi/product-1.webp");

    expect(
      resolveOrderLineProductCode({
        productCode: null,
        productCodeSnapshot: "SSR-001",
      }),
    ).toBe("SSR-001");
  });

  it("formats variant from selections or legacy size", () => {
    expect(
      formatOrderLineVariant({
        selections: { color: "RED", size: "10CM" },
      }),
    ).toBe("Color: RED • Size: 10CM");

    expect(formatOrderLineVariant({ size: "M" })).toBe("Size: M");

    expect(formatOrderLineVariant({ size: null, selections: {} })).toBeNull();

    expect(
      formatOrderLineVariant({
        size: "10CM",
        selections: { group_mszou8qd_l9ttz: "10CM" },
        groupNames: { group_mszou8qd_l9ttz: "Size" },
      }),
    ).toBe("Size: 10CM");
  });
});
