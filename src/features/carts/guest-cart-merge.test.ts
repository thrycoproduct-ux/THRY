import { cartHasLines, decideGuestCartMerge } from "./guest-cart-merge";

describe("decideGuestCartMerge", () => {
  const base = {
    sawLoggedOutInThisRuntime: false,
    dbHasLines: false,
    cookieHasLines: true,
    authCartCleared: false,
  };

  it("never writes cookie into DB on session restore (INITIAL_SESSION)", () => {
    expect(
      decideGuestCartMerge({ ...base, authEvent: "INITIAL_SESSION" }),
    ).toBe("sync_from_db");
  });

  it("never writes cookie into DB on SIGNED_IN after an existing session", () => {
    expect(
      decideGuestCartMerge({
        ...base,
        authEvent: "SIGNED_IN",
        sawLoggedOutInThisRuntime: false,
        dbHasLines: false,
        cookieHasLines: true,
      }),
    ).toBe("sync_from_db");
  });

  it("reproduces the Shop → Cart resurrection: empty DB + stale cookie + SIGNED_IN first", () => {
    const action = decideGuestCartMerge({
      authEvent: "SIGNED_IN",
      sawLoggedOutInThisRuntime: false,
      dbHasLines: false,
      cookieHasLines: true,
      authCartCleared: false,
    });
    expect(action).not.toBe("merge_cookie_to_db");
    expect(action).toBe("sync_from_db");
  });

  it("merges guest cookie only after a real logout → login with empty DB", () => {
    expect(
      decideGuestCartMerge({
        authEvent: "SIGNED_IN",
        sawLoggedOutInThisRuntime: true,
        dbHasLines: false,
        cookieHasLines: true,
        authCartCleared: false,
      }),
    ).toBe("merge_cookie_to_db");
  });

  it("keeps DB cart when guest signs in with items already in DB", () => {
    expect(
      decideGuestCartMerge({
        authEvent: "SIGNED_IN",
        sawLoggedOutInThisRuntime: true,
        dbHasLines: true,
        cookieHasLines: true,
        authCartCleared: false,
      }),
    ).toBe("sync_from_db");
  });

  it("does not merge a stale cookie after the user emptied the auth cart", () => {
    expect(
      decideGuestCartMerge({
        authEvent: "SIGNED_IN",
        sawLoggedOutInThisRuntime: true,
        dbHasLines: false,
        cookieHasLines: true,
        authCartCleared: true,
      }),
    ).toBe("sync_from_db");
  });
});

describe("cartHasLines", () => {
  it("detects quantities", () => {
    expect(cartHasLines({ a: { quantity: 2 } })).toBe(true);
    expect(cartHasLines({ a: { quantity: 0 } })).toBe(false);
    expect(cartHasLines({})).toBe(false);
    expect(cartHasLines(null)).toBe(false);
  });
});
