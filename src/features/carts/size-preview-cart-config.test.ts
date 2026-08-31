import {
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
