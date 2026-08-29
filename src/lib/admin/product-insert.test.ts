import {
  shouldRetryProductCreate,
  type AllocatedProductIdentity,
} from "./product-insert";
import { isUniqueViolation } from "@/lib/supabase/pooler-errors";

describe("shouldRetryProductCreate", () => {
  it("retries unique and socket faults", () => {
    expect(shouldRetryProductCreate({ code: "23505" })).toBe(true);
    expect(
      shouldRetryProductCreate(
        new Error("Cannot read properties of undefined (reading 'queue')"),
      ),
    ).toBe(true);
  });

  it("skips validation failures", () => {
    expect(shouldRetryProductCreate(new Error("Catalog is required."))).toBe(
      false,
    );
  });
});

describe("AllocatedProductIdentity", () => {
  it("is a plain shape for insert builders", () => {
    const identity: AllocatedProductIdentity = {
      id: "abc",
      productCode: "ST000001",
      slug: "test",
      name: "Test ST000001",
    };
    expect(identity.productCode).toMatch(/^ST/);
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });
});
