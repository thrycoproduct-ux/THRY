import { productIdsFromKey, productIdsKey } from "./product-ids-key";

describe("productIdsKey", () => {
  it("is identical for equal id sets regardless of order, duplicates or array identity", () => {
    expect(productIdsKey(["b", "a", "b"])).toBe("a,b");
    expect(productIdsKey(["a", "b"])).toBe(productIdsKey(["b", "a"]));
  });

  it("ignores empty ids and handles empty input", () => {
    expect(productIdsKey(["", "a"])).toBe("a");
    expect(productIdsKey([])).toBe("");
  });

  it("round-trips through productIdsFromKey", () => {
    expect(productIdsFromKey(productIdsKey(["c", "a"]))).toEqual(["a", "c"]);
    expect(productIdsFromKey("")).toEqual([]);
  });
});
