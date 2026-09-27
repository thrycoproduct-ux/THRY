const redisStore = new Map<string, unknown>();
let redisAvailable = true;

jest.mock("./redis", () => ({
  redisGetChecked: jest.fn(async (key: string) =>
    redisAvailable
      ? { ok: true, value: redisStore.get(key) ?? null }
      : { ok: false },
  ),
  redisSet: jest.fn(async (key: string, value: unknown) => {
    redisStore.set(key, value);
  }),
  redisDel: jest.fn(async (keys: string[]) => {
    keys.forEach((key) => redisStore.delete(key));
  }),
  redisDelByPrefix: jest.fn(async (prefix: string) => {
    for (const key of [...redisStore.keys()]) {
      if (key.startsWith(prefix)) redisStore.delete(key);
    }
  }),
}));

jest.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

import {
  clearStorefrontCacheEntries,
  clearStorefrontMemoryCache,
  withStorefrontCache,
} from "./storefront-cache";

describe("withStorefrontCache", () => {
  beforeEach(() => {
    clearStorefrontMemoryCache();
    redisStore.clear();
    redisAvailable = true;
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("serves the last known-good value when the loader fails", async () => {
    const key = `test:stale:${Math.random()}`;
    let mode: "ok" | "fail" = "ok";

    const loader = jest.fn(async () => {
      if (mode === "fail") throw new Error("connection terminated");
      return { items: [1, 2, 3] };
    });

    const first = await withStorefrontCache(key, loader, { revalidate: 0 });
    expect(first).toEqual({ items: [1, 2, 3] });

    mode = "fail";
    const second = await withStorefrontCache(key, loader, { revalidate: 0 });

    // Fresh read failed, so the previous payload is reused instead of throwing.
    expect(second).toEqual({ items: [1, 2, 3] });
  });

  it("propagates the error when no cached value exists", async () => {
    const key = `test:cold:${Math.random()}`;

    await expect(
      withStorefrontCache(
        key,
        async () => {
          throw new Error("relation does not exist");
        },
        { revalidate: 0 },
      ),
    ).rejects.toThrow("relation does not exist");
  });

  it("reuses a fresh value without calling the loader again", async () => {
    const key = `test:fresh:${Math.random()}`;
    const loader = jest.fn(async () => "value");

    await withStorefrontCache(key, loader, { revalidate: 120 });
    const second = await withStorefrontCache(key, loader, { revalidate: 120 });

    expect(second).toBe("value");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("reloads after another instance cleared the shared entry", async () => {
    jest.useFakeTimers({ now: Date.now() });
    const key = `sf:product:${Math.random()}`;
    let version = 1;
    const loader = jest.fn(async () => version);

    await withStorefrontCache(key, loader, { revalidate: 1800 });

    // Another instance edits the product and deletes the shared Redis entry;
    // this isolate's memory copy is untouched.
    version = 2;
    redisStore.clear();

    // Steady local hits must not keep extending the trust window.
    for (let i = 0; i < 3; i += 1) {
      jest.setSystemTime(Date.now() + 9_000);
      expect(await withStorefrontCache(key, loader, { revalidate: 1800 })).toBe(
        1,
      );
    }

    jest.setSystemTime(Date.now() + 5_000);
    const value = await withStorefrontCache(key, loader, { revalidate: 1800 });
    expect(value).toBe(2);
  });

  it("falls through to the Data Cache after the trust window when Redis is unavailable", async () => {
    jest.useFakeTimers({ now: Date.now() });
    const key = `sf:product:${Math.random()}`;
    const loader = jest.fn(async () => "value");

    await withStorefrontCache(key, loader, { revalidate: 1800 });
    redisAvailable = false;
    jest.setSystemTime(Date.now() + 20_000);
    await withStorefrontCache(key, loader, { revalidate: 1800 });
    expect(loader).toHaveBeenCalledTimes(1);

    jest.setSystemTime(Date.now() + 11_000);
    await withStorefrontCache(key, loader, { revalidate: 1800 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("clears exact keys without touching keys that share the prefix", async () => {
    const loader = jest.fn(async () => "value");
    await withStorefrontCache("sf:product:saree", loader, { revalidate: 1800 });
    await withStorefrontCache("sf:product:saree-blue", loader, {
      revalidate: 1800,
    });

    await clearStorefrontCacheEntries({ keys: ["sf:product:saree"] });

    expect(redisStore.has("sf:product:saree|v2")).toBe(false);
    expect(redisStore.has("sf:product:saree-blue|v2")).toBe(true);

    await withStorefrontCache("sf:product:saree-blue", loader, {
      revalidate: 1800,
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
