import {
  isControlFlowError,
  isTransientError,
  withFallback,
  withRetry,
  withTimeoutFallback,
} from "./index";

describe("isControlFlowError", () => {
  it("detects Next.js navigation signals", () => {
    expect(isControlFlowError({ digest: "NEXT_REDIRECT;replace;/shop" })).toBe(
      true,
    );
    expect(isControlFlowError({ digest: "NEXT_NOT_FOUND" })).toBe(true);
    expect(isControlFlowError({ name: "DynamicServerError" })).toBe(true);
  });

  it("ignores ordinary errors", () => {
    expect(isControlFlowError(new Error("connection terminated"))).toBe(false);
    expect(isControlFlowError(null)).toBe(false);
  });
});

describe("isTransientError", () => {
  it("matches transport faults", () => {
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
    expect(isTransientError({ networkError: new Error("offline") })).toBe(true);
    expect(
      isTransientError(new Error("wrapped", { cause: new Error("timeout") })),
    ).toBe(true);
    expect(
      isTransientError(
        new TypeError("Cannot set properties of undefined (setting 'onclose')"),
      ),
    ).toBe(true);
  });

  it("does not match deterministic failures", () => {
    expect(isTransientError(new Error("column does not exist"))).toBe(false);
    expect(isTransientError({ digest: "NEXT_NOT_FOUND" })).toBe(false);
  });
});

describe("withRetry", () => {
  it("retries transient failures and resolves", async () => {
    let calls = 0;
    const value = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("ECONNRESET");
        return "ok";
      },
      { baseDelayMs: 1 },
    );

    expect(value).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry deterministic failures", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error("relation does not exist");
        },
        { baseDelayMs: 1 },
      ),
    ).rejects.toThrow("relation does not exist");

    expect(calls).toBe(1);
  });

  it("rethrows after exhausting attempts", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error("socket hang up");
        },
        { attempts: 2, baseDelayMs: 1 },
      ),
    ).rejects.toThrow("socket hang up");

    expect(calls).toBe(2);
  });
});

describe("withFallback", () => {
  it("returns the fallback when the loader fails", async () => {
    const value = await withFallback(
      "test",
      async () => {
        throw new Error("boom");
      },
      ["fallback"],
      { attempts: 1 },
    );

    expect(value).toEqual(["fallback"]);
  });

  it("rethrows navigation signals", async () => {
    await expect(
      withFallback(
        "test",
        async () => {
          throw Object.assign(new Error("redirect"), {
            digest: "NEXT_REDIRECT;replace;/shop",
          });
        },
        null,
        { attempts: 1 },
      ),
    ).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/shop" });
  });
});

describe("withTimeoutFallback", () => {
  it("falls back when the promise rejects", async () => {
    const value = await withTimeoutFallback(
      "test",
      Promise.reject(new Error("boom")),
      1000,
      "fallback",
    );

    expect(value).toBe("fallback");
  });

  it("falls back when the promise hangs", async () => {
    const value = await withTimeoutFallback(
      "test",
      new Promise<string>(() => {}),
      10,
      "fallback",
    );

    expect(value).toBe("fallback");
  });

  it("resolves normally when fast enough", async () => {
    const value = await withTimeoutFallback(
      "test",
      Promise.resolve("ok"),
      1000,
      "fallback",
    );

    expect(value).toBe("ok");
  });
});
