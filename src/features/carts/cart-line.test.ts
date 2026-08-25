import {
  DEFAULT_CART_VARIANT_KEY,
  buildCartLineKey,
  buildCartVariantKey,
  extractProductIdFromCartLineKey,
} from "./cart-line";
import { normalizeCart } from "./useCartStore";

describe("cart line identity", () => {
  it("keeps different sizes of the same product as separate lines", () => {
    const productId = "prod_shirt";
    const small = buildCartLineKey({
      productId,
      selections: { size: "S" },
    });
    const large = buildCartLineKey({
      productId,
      selections: { size: "L" },
    });

    expect(small).not.toBe(large);
    expect(extractProductIdFromCartLineKey(small)).toBe(productId);
    expect(extractProductIdFromCartLineKey(large)).toBe(productId);
  });

  it("merges two adds of the same size into one line", () => {
    const lineKey = buildCartLineKey({
      productId: "prod_shirt",
      selections: { size: "M" },
    });
    const merged = normalizeCart({
      [lineKey]: {
        productId: "prod_shirt",
        quantity: 1,
        selections: { size: "M" },
      },
      extra: {
        productId: "prod_shirt",
        quantity: 2,
        selections: { size: "M" },
      },
    });

    expect(Object.keys(merged)).toEqual([lineKey]);
    expect(merged[lineKey].quantity).toBe(3);
  });

  it("migrates a legacy productId-only cart key", () => {
    const migrated = normalizeCart({
      prod_shirt: { quantity: 2, size: "XL" },
    });
    const lineKey = buildCartLineKey({
      productId: "prod_shirt",
      size: "XL",
    });

    expect(migrated[lineKey]?.quantity).toBe(2);
    expect(migrated[lineKey]?.productId).toBe("prod_shirt");
    expect(migrated.prod_shirt).toBeUndefined();
  });

  it("keeps different colours of the same product as separate lines", () => {
    const productId = "prod_stamp";
    const red = buildCartLineKey({
      productId,
      selections: { color: "RED" },
    });
    const blue = buildCartLineKey({
      productId,
      selections: { color: "BLUE" },
    });

    expect(red).not.toBe(blue);
    expect(buildCartVariantKey({ selections: { color: "RED" } })).toBe(
      "color=RED",
    );
  });

  it("keeps multi-group colour+size combinations distinct", () => {
    const productId = "prod_stamp";
    const a = buildCartLineKey({
      productId,
      selections: { color: "RED", size: "M" },
    });
    const b = buildCartLineKey({
      productId,
      selections: { color: "RED", size: "L" },
    });
    const c = buildCartLineKey({
      productId,
      selections: { color: "BLUE", size: "M" },
    });

    expect(new Set([a, b, c]).size).toBe(3);
    expect(buildCartVariantKey({ selections: { size: "M", color: "RED" } })).toBe(
      "color=RED|size=M",
    );
  });
});
