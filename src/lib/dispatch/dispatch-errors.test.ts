import {
  DISPATCH_GUARD_MISMATCH_MESSAGE,
  DispatchConflictError,
  mapDispatchPersistenceError,
} from "./dispatch-errors";

describe("mapDispatchPersistenceError", () => {
  it("maps guard mismatch to conflict", () => {
    const mapped = mapDispatchPersistenceError(
      new Error(DISPATCH_GUARD_MISMATCH_MESSAGE),
    );
    expect(mapped).toBeInstanceOf(DispatchConflictError);
    expect(mapped.message).toMatch(/already dispatched/i);
  });

  it("maps unique violation to conflict", () => {
    const mapped = mapDispatchPersistenceError({ code: "23505" });
    expect(mapped).toBeInstanceOf(DispatchConflictError);
  });

  it("maps foreign key violation to actionable message", () => {
    const mapped = mapDispatchPersistenceError({ code: "23503" });
    expect(mapped.message).toMatch(/invalid/i);
  });

  it("maps postgres.js connection race to retry message", () => {
    const mapped = mapDispatchPersistenceError(
      new Error("Cannot set properties of undefined (setting 'onclose')"),
    );
    expect(mapped.message).toMatch(/interrupted/i);
  });
});
