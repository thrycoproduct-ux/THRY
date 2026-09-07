import { applyDbCartRowsToClientMirror } from "./apply-db-cart-mirror";

describe("applyDbCartRowsToClientMirror", () => {
  it("writes mapped lines when the DB cart has quantities", () => {
    const calls: unknown[] = [];
    applyDbCartRowsToClientMirror(
      [{ product_id: "p1", quantity: 2, size: "M", selections: null }],
      (cart) => {
        calls.push(cart);
      },
    );
    expect(calls).toHaveLength(1);
    const cart = calls[0] as Record<string, { quantity: number }>;
    expect(Object.values(cart).some((line) => line.quantity === 2)).toBe(true);
  });

  it("clears the client mirror when the DB cart is empty", () => {
    const calls: unknown[] = [];
    applyDbCartRowsToClientMirror([], (cart) => {
      calls.push(cart);
    });
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0]).toEqual({});
    expect(calls[calls.length - 1]).toEqual({});
  });

  it("treats zero-quantity rows as empty", () => {
    const calls: unknown[] = [];
    applyDbCartRowsToClientMirror(
      [{ product_id: "p1", quantity: 0, size: null, selections: null }],
      (cart) => {
        calls.push(cart);
      },
    );
    expect(calls[0]).toEqual({});
  });
});
