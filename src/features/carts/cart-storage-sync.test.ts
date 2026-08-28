import { buildCartLineKey } from "./cart-line";
import { dbCartRowsToCartItems } from "./cart-storage-sync";

describe("dbCartRowsToCartItems", () => {
  it("maps db rows to cookie line keys with variants", () => {
    const items = dbCartRowsToCartItems([
      {
        product_id: "prod_krishna",
        quantity: 1,
        size: "6CM",
        selections: { legacy: "6CM" },
      },
    ]);

    const lineKey = buildCartLineKey({
      productId: "prod_krishna",
      size: "6CM",
      selections: { legacy: "6CM" },
    });

    expect(items[lineKey]).toEqual({
      productId: "prod_krishna",
      quantity: 1,
      size: "6CM",
      selections: { legacy: "6CM" },
    });
  });
});
