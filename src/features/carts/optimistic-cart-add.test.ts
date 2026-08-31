import {
  buildCartLineKey,
  buildCartVariantKey,
} from "./cart-line";
import {
  buildOptimisticCartLineKeys,
  getCartLineQuantity,
  snapshotCart,
} from "./optimistic-cart-add";
import type { CartItems } from "./useCartStore";

describe("optimistic cart add helpers", () => {
  it("getCartLineQuantity reads quantity by line key", () => {
    const lineKey = buildCartLineKey({ productId: "prod-1", size: "M" });
    const cart: CartItems = {
      [lineKey]: {
        productId: "prod-1",
        quantity: 2,
        size: "M",
      },
    };
    expect(getCartLineQuantity(cart, "prod-1", "M")).toBe(2);
    expect(getCartLineQuantity(cart, "prod-1", "L")).toBe(0);
  });

  it("buildOptimisticCartLineKeys normalizes size and builds keys", () => {
    const keys = buildOptimisticCartLineKeys({
      productId: "prod-1",
      quantity: 1,
      size: " m ",
      selections: { group: "M" },
    });
    expect(keys.normalizedSize).toBe("M");
    expect(keys.variantKey).toBe(
      buildCartVariantKey({ productId: "prod-1", selections: { group: "M" } }),
    );
    expect(keys.lineKey).toBe(
      buildCartLineKey({
        productId: "prod-1",
        selections: { group: "M" },
      }),
    );
    expect(keys.sizeOrSelections).toEqual({ group: "M" });
  });

  it("snapshotCart clones cart for rollback", () => {
    const cart: CartItems = {
      "prod-1::default": { productId: "prod-1", quantity: 1 },
    };
    const snap = snapshotCart(cart);
    cart["prod-1::default"].quantity = 99;
    expect(snap["prod-1::default"].quantity).toBe(1);
  });
});
