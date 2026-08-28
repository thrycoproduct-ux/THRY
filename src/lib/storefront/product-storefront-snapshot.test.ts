jest.mock("../cache/redis", () => ({
  redisGet: jest.fn(async () => null),
  redisSet: jest.fn(async () => undefined),
}));

jest.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock("../supabase/db", () => ({
  __esModule: true,
  default: {
    select: jest.fn(),
  },
}));

import db from "../supabase/db";
import { clearStorefrontMemoryCache } from "../cache/storefront-cache";
import {
  buildSnapshotRecord,
  formatPackLabelFromSnapshot,
  getProductStorefrontSnapshotsByIds,
} from "./product-storefront-snapshot";

const mockDb = db as unknown as {
  select: jest.Mock;
};

function mockSelectRows(rows: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(rows),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

describe("buildSnapshotRecord", () => {
  it("maps physical product pricing and pack label fields", () => {
    const record = buildSnapshotRecord([
      {
        id: "prod-1",
        price: "499.00",
        discountEnabled: true,
        discountPercent: 10,
        soldAsPack: true,
        packSize: 6,
        isDigital: false,
        digitalFileName: null,
      },
    ]);

    const snap = record["prod-1"];
    expect(snap.pricing.unitPrice).toBe(449.1);
    expect(snap.pricing.soldAsPack).toBe(true);
    expect(snap.pricing.packSize).toBe(6);
    expect(snap.isDigital).toBe(false);
    expect(formatPackLabelFromSnapshot(snap)).toBe("Set of 6");
  });

  it("sanitizes digital file names and flags digital products", () => {
    const record = buildSnapshotRecord([
      {
        id: "dig-1",
        price: "99.00",
        discountEnabled: false,
        discountPercent: null,
        soldAsPack: false,
        packSize: null,
        isDigital: true,
        digitalFileName: "my file.pdf",
      },
    ]);

    const snap = record["dig-1"];
    expect(snap.isDigital).toBe(true);
    expect(snap.digitalFileName).toBe("my-file.pdf");
    expect(formatPackLabelFromSnapshot(snap)).toBeNull();
  });

  it("returns no entry for rows the query did not return (deleted product)", () => {
    const record = buildSnapshotRecord([]);
    expect(record).toEqual({});
  });
});

describe("getProductStorefrontSnapshotsByIds", () => {
  beforeEach(() => {
    clearStorefrontMemoryCache();
    jest.clearAllMocks();
  });

  it("returns an empty map for empty input without hitting the database", async () => {
    const result = await getProductStorefrontSnapshotsByIds(["", "  "]);
    expect(result.size).toBe(0);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("dedupes and sorts ids so cache keys are stable", async () => {
    mockSelectRows([
      {
        id: "b",
        price: "10.00",
        discountEnabled: false,
        discountPercent: null,
        soldAsPack: false,
        packSize: null,
        isDigital: false,
        digitalFileName: null,
      },
      {
        id: "a",
        price: "20.00",
        discountEnabled: false,
        discountPercent: null,
        soldAsPack: false,
        packSize: null,
        isDigital: false,
        digitalFileName: null,
      },
    ]);

    await getProductStorefrontSnapshotsByIds(["b", "a", "b"]);
    await getProductStorefrontSnapshotsByIds(["a", "b"]);

    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("loads main product + recommendation ids in one select (PDP path)", async () => {
    mockSelectRows([
      {
        id: "main",
        price: "100.00",
        discountEnabled: false,
        discountPercent: null,
        soldAsPack: false,
        packSize: null,
        isDigital: false,
        digitalFileName: null,
      },
      {
        id: "rec-1",
        price: "50.00",
        discountEnabled: true,
        discountPercent: 20,
        soldAsPack: true,
        packSize: 3,
        isDigital: false,
        digitalFileName: null,
      },
    ]);

    const map = await getProductStorefrontSnapshotsByIds([
      "main",
      "rec-1",
      "rec-2",
    ]);

    expect(mockDb.select).toHaveBeenCalledTimes(1);
    expect(map.get("main")?.pricing.unitPrice).toBe(100);
    expect(formatPackLabelFromSnapshot(map.get("rec-1"))).toBe("Set of 3");
    expect(map.has("rec-2")).toBe(false);
  });
});
