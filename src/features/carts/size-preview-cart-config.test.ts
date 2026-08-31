import {
  productSizeConfigToCartConfig,
  shouldBlockBareCartAdd,
  sizePreviewToCartConfig,
} from "./cart-options-guard";
import type { ProductSizePreview } from "@/lib/products/sizeConfig-shared";

const listingPreview: ProductSizePreview = {
  enabled: true,
  optionName: "Size",
  labels: ["M"],
  groupId: "size-group",
  canPickOnListing: true,
  choices: [{ value: "M", label: "M", price: 100 }],
};

describe("sizePreviewToCartConfig", () => {
  it("maps listing preview to guard config without network", () => {
    const config = sizePreviewToCartConfig(listingPreview);
    expect(
      shouldBlockBareCartAdd({
        sizeConfig: config,
        selections: { "size-group": "M" },
        size: "M",
      }),
    ).toBe(false);
    expect(
      shouldBlockBareCartAdd({
        sizeConfig: config,
        selections: undefined,
        size: undefined,
      }),
    ).toBe(true);
  });

  it("returns disabled config when preview is not enabled", () => {
    const config = sizePreviewToCartConfig({
      ...listingPreview,
      enabled: false,
      canPickOnListing: false,
    });
    expect(
      shouldBlockBareCartAdd({
        sizeConfig: config,
        selections: undefined,
        size: undefined,
      }),
    ).toBe(false);
  });
});

describe("productSizeConfigToCartConfig", () => {
  it("maps PDP size config to guard payload", () => {
    const config = productSizeConfigToCartConfig({
      enabled: true,
      name: "Size",
      groups: [
        {
          id: "g1",
          name: "Size",
          options: [{ value: "S", size: "S", qty: 1 }],
        },
      ],
    });
    expect(
      shouldBlockBareCartAdd({
        sizeConfig: config,
        selections: { g1: "S" },
        size: "S",
      }),
    ).toBe(false);
  });
});
