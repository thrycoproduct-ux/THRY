import { DEFAULT_CART_VARIANT_KEY } from "./cart-line";
import {
  areCartSelectionsComplete,
  isBareDefaultVariantKey,
  partitionProductIdsByOptionsRequired,
  productRequiresOptions,
  shouldBlockBareCartAdd,
  shouldPurgeBareCartLine,
  type CartSizeConfigPayload,
} from "./cart-options-guard";

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
});
