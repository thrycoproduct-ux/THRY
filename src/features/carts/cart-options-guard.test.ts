import { DEFAULT_CART_VARIANT_KEY } from "./cart-line";
import {
  areCartSelectionsComplete,
  findIncompleteCheckoutProductIds,
  isBareDefaultVariantKey,
  partitionProductIdsByOptionsRequired,
  productRequiresOptions,
  resolveCheckoutSizeConfigs,
  shouldBlockBareCartAdd,
  shouldPurgeBareCartLine,
  shouldPurgeStaleCartLineWhenAdding,
  type CartSizeConfigPayload,
} from "./cart-options-guard";

const singleSizeConfig: CartSizeConfigPayload = {
  enabled: true,
  name: "Size",
  groups: [
    {
      id: "legacy",
      name: "Size",
      options: [
        { value: "6CM", qty: 5 },
        { value: "10CM", qty: 3 },
      ],
    },
  ],
};

const colourSizeConfig: CartSizeConfigPayload = {
  enabled: true,
  name: "Colour",
  groups: [
    {
      id: "color",
      name: "Colour",
      options: [
        { value: "RED", qty: 5 },
        { value: "BLUE", qty: 3 },
      ],
    },
    {
      id: "size",
      name: "Size",
      options: [
        { value: "M", qty: 2 },
        { value: "L", qty: 2 },
      ],
    },
  ],
};

const noOptionsConfig: CartSizeConfigPayload = {
  enabled: false,
  name: "Size",
  groups: [],
};

describe("cart-options-guard", () => {
  it("requires options only when enabled groups have stock", () => {
    expect(productRequiresOptions(colourSizeConfig)).toBe(true);
    expect(productRequiresOptions(noOptionsConfig)).toBe(false);
    expect(
      productRequiresOptions({
        enabled: true,
        groups: [{ id: "color", options: [{ value: "RED", qty: 0 }] }],
      }),
    ).toBe(false);
  });

  it("blocks bare adds for option products without complete selections", () => {
    expect(
      shouldBlockBareCartAdd({
        sizeConfig: colourSizeConfig,
        selections: null,
      }),
    ).toBe(true);
    expect(
      shouldBlockBareCartAdd({
        sizeConfig: colourSizeConfig,
        selections: { color: "RED" },
      }),
    ).toBe(true);
    expect(
      shouldBlockBareCartAdd({
        sizeConfig: colourSizeConfig,
        selections: { color: "RED", size: "M" },
      }),
    ).toBe(false);
    expect(
      shouldBlockBareCartAdd({
        sizeConfig: noOptionsConfig,
        selections: null,
      }),
    ).toBe(false);
  });

  it("treats complete multi-group selections as complete", () => {
    expect(
      areCartSelectionsComplete({
        sizeConfig: colourSizeConfig,
        selections: { size: "L", color: "BLUE" },
      }),
    ).toBe(true);
  });

  it("allows default lines only when options are not required", () => {
    expect(isBareDefaultVariantKey(DEFAULT_CART_VARIANT_KEY)).toBe(true);
    expect(isBareDefaultVariantKey("color=RED")).toBe(false);

    expect(
      shouldPurgeBareCartLine({
        sizeConfig: colourSizeConfig,
        variantKey: DEFAULT_CART_VARIANT_KEY,
        selections: null,
      }),
    ).toBe(true);

    expect(
      shouldPurgeBareCartLine({
        sizeConfig: colourSizeConfig,
        variantKey: "color=RED",
        selections: { color: "RED" },
      }),
    ).toBe(false);

    expect(
      shouldPurgeBareCartLine({
        sizeConfig: noOptionsConfig,
        variantKey: DEFAULT_CART_VARIANT_KEY,
        selections: null,
      }),
    ).toBe(false);
  });

  it("purges stale default and size-only lines when adding a complete variant", () => {
    expect(
      shouldPurgeStaleCartLineWhenAdding({
        sizeConfig: singleSizeConfig,
        existingVariantKey: DEFAULT_CART_VARIANT_KEY,
        existingSelections: null,
        existingSize: null,
        keepVariantKey: "legacy=6CM",
        newSelections: { legacy: "6CM" },
        newSize: "6CM",
      }),
    ).toBe(true);

    expect(
      shouldPurgeStaleCartLineWhenAdding({
        sizeConfig: singleSizeConfig,
        existingVariantKey: "size=6CM",
        existingSelections: null,
        existingSize: "6CM",
        keepVariantKey: "legacy=6CM",
        newSelections: { legacy: "6CM" },
        newSize: "6CM",
      }),
    ).toBe(true);

    expect(
      shouldPurgeStaleCartLineWhenAdding({
        sizeConfig: singleSizeConfig,
        existingVariantKey: "legacy=10CM",
        existingSelections: { legacy: "10CM" },
        existingSize: "10CM",
        keepVariantKey: "legacy=6CM",
        newSelections: { legacy: "6CM" },
        newSize: "6CM",
      }),
    ).toBe(false);
  });

  it("partitions deeplink product ids into allowed vs skipped", () => {
    const configs = {
      plain: noOptionsConfig,
      variant: colourSizeConfig,
    };
    expect(
      partitionProductIdsByOptionsRequired(["plain", "variant"], configs),
    ).toEqual({
      allowed: ["plain"],
      skipped: ["variant"],
    });
  });

  it("treats complete selections with null legacy size as complete", () => {
    expect(
      areCartSelectionsComplete({
        sizeConfig: colourSizeConfig,
        selections: { color: "RED", size: "M" },
        size: null,
      }),
    ).toBe(true);

    expect(
      findIncompleteCheckoutProductIds({
        order: {
          "p1::color=RED|size=M": {
            productId: "p1",
            size: null,
            selections: { color: "RED", size: "M" },
          },
        },
        sizeConfigsByProductId: { p1: colourSizeConfig },
      }),
    ).toEqual([]);
  });

  it("flags incomplete checkout lines when options are required but empty", () => {
    expect(
      areCartSelectionsComplete({
        sizeConfig: colourSizeConfig,
        selections: null,
        size: null,
      }),
    ).toBe(false);

    expect(
      findIncompleteCheckoutProductIds({
        order: {
          "p1::default": {
            productId: "p1",
            size: null,
            selections: null,
          },
        },
        sizeConfigsByProductId: { p1: colourSizeConfig },
      }),
    ).toEqual(["p1"]);
  });

  it("treats disabled options as complete for checkout", () => {
    expect(
      areCartSelectionsComplete({
        sizeConfig: noOptionsConfig,
        selections: null,
        size: null,
      }),
    ).toBe(true);

    expect(
      findIncompleteCheckoutProductIds({
        order: {
          "p2::default": { productId: "p2", size: null },
        },
        sizeConfigsByProductId: { p2: noOptionsConfig },
      }),
    ).toEqual([]);
  });

  it("batch-resolves only missing checkout size configs", async () => {
    const fetchConfigs = jest.fn(async () => ({
      p2: colourSizeConfig,
    }));
    const merged = await resolveCheckoutSizeConfigs({
      productIds: ["p1", "p2"],
      knownConfigs: { p1: noOptionsConfig },
      fetchConfigs,
    });
    expect(fetchConfigs).toHaveBeenCalledWith(["p2"]);
    expect(merged.p1).toBe(noOptionsConfig);
    expect(merged.p2).toBe(colourSizeConfig);
  });
});
