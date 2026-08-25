import {
  DEFAULT_PRODUCT_OPTION_NAME,
  LEGACY_OPTION_GROUP_ID,
  getMinSelectableOptionPrice,
  normalizeProductSizeConfig,
  resolveListPriceForSelection,
  serializeProductSizeConfig,
  sumSelectedOptionListPrices,
  toProductSizePreview,
} from "./sizeConfig-shared";

describe("normalizeProductSizeConfig", () => {
  it("migrates legacy flat name/options into a single group", () => {
    const config = normalizeProductSizeConfig({
      enabled: true,
      options: [{ size: "XL", qty: 2, price: 100 }],
    });

    expect(config.name).toBe(DEFAULT_PRODUCT_OPTION_NAME);
    expect(config.groups).toHaveLength(1);
    expect(config.groups[0].id).toBe(LEGACY_OPTION_GROUP_ID);
    expect(config.groups[0].options[0]).toEqual({
      value: "XL",
      size: "XL",
      qty: 2,
      price: 100,
    });
    expect(config.options[0].value).toBe("XL");
  });

  it("maps legacy size into value and mirrors size alias", () => {
    const config = normalizeProductSizeConfig({
      enabled: true,
      options: [{ size: "with magnet", qty: 3 }],
    });

    expect(config.options[0]).toEqual({
      value: "WITH MAGNET",
      size: "WITH MAGNET",
      qty: 3,
      price: null,
    });
  });

  it("normalizes multi-group payloads", () => {
    const config = normalizeProductSizeConfig({
      enabled: true,
      groups: [
        {
          id: "size",
          name: "Size",
          options: [{ value: "36", qty: 2, price: 200 }],
        },
        {
          id: "magnet",
          name: "Magnet",
          options: [
            { value: "WITH MAGNET", qty: 5, price: 50 },
            { value: "WITHOUT MAGNET", qty: 5, price: 0 },
          ],
        },
      ],
    });

    expect(config.groups).toHaveLength(2);
    expect(config.groups[1].name).toBe("Magnet");
    expect(config.name).toBe("Size");
    expect(config.options[0].value).toBe("36");
  });

  it("dedupes options by normalized value within a group", () => {
    const config = normalizeProductSizeConfig({
      enabled: true,
      options: [
        { value: "XL", qty: 1, price: 100 },
        { size: " xl ", qty: 4, price: 250 },
      ],
    });

    expect(config.options).toHaveLength(1);
    expect(config.options[0].qty).toBe(4);
    expect(config.options[0].price).toBe(250);
  });
});

describe("serializeProductSizeConfig", () => {
  it("writes groups plus legacy mirrors", () => {
    const serialized = serializeProductSizeConfig({
      enabled: true,
      name: "Magnet",
      options: [],
      groups: [
        {
          id: "magnet",
          name: "Magnet",
          options: [
            { value: "WITH MAGNET", size: "WITH MAGNET", qty: 5, price: 350 },
            { value: "NO MAGNET", size: "NO MAGNET", qty: 2, price: null },
          ],
        },
      ],
    });

    expect(serialized.enabled).toBe(true);
    expect(serialized.groups).toEqual([
      {
        id: "magnet",
        name: "Magnet",
        options: [
          { value: "WITH MAGNET", qty: 5, price: 350 },
          { value: "NO MAGNET", qty: 2 },
        ],
      },
    ]);
    expect(serialized.name).toBe("Magnet");
    expect(serialized.options).toEqual([
      { value: "WITH MAGNET", qty: 5, price: 350 },
      { value: "NO MAGNET", qty: 2 },
    ]);
  });
});

describe("multi-group pricing", () => {
  const config = normalizeProductSizeConfig({
    enabled: true,
    groups: [
      {
        id: "size",
        name: "Size",
        options: [
          { value: "S", qty: 2, price: 400 },
          { value: "L", qty: 1, price: 600 },
        ],
      },
      {
        id: "magnet",
        name: "Magnet",
        options: [
          { value: "WITH MAGNET", qty: 3, price: 100 },
          { value: "WITHOUT MAGNET", qty: 3, price: 0 },
        ],
      },
    ],
  });

  it("sums selected option prices across groups", () => {
    expect(
      sumSelectedOptionListPrices(config, {
        size: "L",
        magnet: "WITH MAGNET",
      }),
    ).toBe(700);
  });

  it("uses sum for resolveListPriceForSelection", () => {
    expect(
      resolveListPriceForSelection({
        baseListPrice: 999,
        sizeConfig: config,
        selections: { size: "S", magnet: "WITHOUT MAGNET" },
      }),
    ).toBe(400);
  });

  it("falls back to product price for legacy options without price", () => {
    const legacy = normalizeProductSizeConfig({
      enabled: true,
      options: [{ value: "XL", qty: 1 }],
    });
    expect(
      resolveListPriceForSelection({
        baseListPrice: 999,
        sizeConfig: legacy,
        selectedSize: "XL",
      }),
    ).toBe(999);
  });

  it("prefers cheapest sum when unselected", () => {
    expect(getMinSelectableOptionPrice(config)).toBe(400);
    expect(
      resolveListPriceForSelection({
        baseListPrice: 999,
        sizeConfig: config,
        preferMinWhenUnselected: true,
      }),
    ).toBe(400);
  });
});

describe("toProductSizePreview", () => {
  it("returns empty preview when disabled or out of stock", () => {
    expect(
      toProductSizePreview({
        enabled: false,
        options: [{ value: "XL", qty: 2 }],
      }),
    ).toEqual({
      enabled: false,
      optionName: DEFAULT_PRODUCT_OPTION_NAME,
      labels: [],
    });

    expect(
      toProductSizePreview({
        enabled: true,
        options: [{ value: "XL", qty: 0 }],
      }),
    ).toMatchObject({ enabled: false, labels: [] });
  });

  it("formats single-group letter sizes with qty", () => {
    const preview = toProductSizePreview(
      normalizeProductSizeConfig({
        enabled: true,
        options: [
          { value: "S", qty: 2 },
          { value: "XL", qty: 1 },
        ],
      }),
    );

    expect(preview.enabled).toBe(true);
    expect(preview.optionName).toBe(DEFAULT_PRODUCT_OPTION_NAME);
    expect(preview.labels).toEqual(["S : 2", "XL : 1"]);
  });

  it("prefixes multi-group labels with group name", () => {
    const preview = toProductSizePreview(
      normalizeProductSizeConfig({
        enabled: true,
        groups: [
          {
            id: "size",
            name: "Size",
            options: [{ value: "36", qty: 2 }],
          },
          {
            id: "magnet",
            name: "Magnet",
            options: [{ value: "WITH MAGNET", qty: 5 }],
          },
        ],
      }),
    );

    expect(preview.labels).toEqual([
      "Size: 36",
      "Magnet: WITH MAGNET",
    ]);
  });
});
