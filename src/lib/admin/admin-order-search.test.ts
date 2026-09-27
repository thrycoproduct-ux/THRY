import { buildAdminOrderSearchTerms } from "@/lib/admin/admin-order-search";

describe("buildAdminOrderSearchTerms", () => {
  it("returns null for empty input", () => {
    expect(buildAdminOrderSearchTerms("")).toBeNull();
    expect(buildAdminOrderSearchTerms("   ")).toBeNull();
    expect(buildAdminOrderSearchTerms(undefined)).toBeNull();
  });

  it("strips the THRY brand for internal ref matching", () => {
    expect(buildAdminOrderSearchTerms("THRY26090153")).toEqual({
      idPattern: "%THRY26090153%",
      refPattern: "%26090153%",
    });
  });

  it("accepts the packing slip display form", () => {
    expect(buildAdminOrderSearchTerms("Ref #THRY26090153")?.refPattern).toBe(
      "%26090153%",
    );
  });

  it("supports partial refs", () => {
    expect(buildAdminOrderSearchTerms("0153")).toEqual({
      idPattern: "%0153%",
      refPattern: "%0153%",
    });
  });

  it("drops a leading # for order ids", () => {
    expect(buildAdminOrderSearchTerms("#ord_abc")).toEqual({
      idPattern: "%ord\\_abc%",
      refPattern: null,
    });
  });

  it("does not treat digits inside an order id as a ref", () => {
    expect(buildAdminOrderSearchTerms("#xelk2hxa")?.refPattern).toBeNull();
  });

  it("allows a dash after the brand", () => {
    expect(buildAdminOrderSearchTerms("THRY-0153")?.refPattern).toBe("%0153%");
  });

  it("escapes LIKE wildcards in order ids", () => {
    expect(buildAdminOrderSearchTerms("a%b")?.idPattern).toBe("%a\\%b%");
  });
});
