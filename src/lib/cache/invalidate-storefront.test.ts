import { revalidatePath, revalidateTag } from "next/cache";
import { redisDelByPrefix } from "./redis";
import { clearStorefrontCacheEntries } from "./storefront-cache";
import {
  isCatalogD1Enabled,
  syncCatalogMirror,
  triggerCatalogMirrorSync,
} from "../catalog/d1-mirror";

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
  revalidatePath: jest.fn(),
}));

jest.mock("../admin/getAdminProductsList", () => ({
  ADMIN_PRODUCTS_LIST_TAG: "admin-products-list",
}));

jest.mock("./redis", () => ({
  redisDelByPrefix: jest.fn(async () => undefined),
}));

jest.mock("./storefront-cache", () => ({
  clearStorefrontMemoryCache: jest.fn(),
  clearStorefrontCacheEntries: jest.fn(async () => undefined),
}));

jest.mock("../catalog/d1-mirror", () => ({
  isCatalogD1Enabled: jest.fn(() => false),
  syncCatalogMirror: jest.fn(async () => ({ ok: true, data: { ok: true } })),
  triggerCatalogMirrorSync: jest.fn(),
}));

jest.mock("next/server", () => ({
  after: jest.fn((task: () => unknown) => {
    void task();
  }),
}));

let dbRows: { id: string; slug: string; featured: boolean | null }[] = [];

jest.mock("../supabase/db", () => ({
  __esModule: true,
  default: {
    select: () => ({
      from: () => ({ where: async () => dbRows }),
    }),
  },
}));

jest.mock("../supabase/schema", () => ({
  products: { id: "id", slug: "slug", featured: "featured" },
}));

import {
  invalidateProductCaches,
  invalidateStorefrontCache,
} from "./invalidate-storefront";

function clearedWith() {
  const [params] = (clearStorefrontCacheEntries as jest.Mock).mock.calls[0];
  return params as { keys: string[]; prefixes: string[] };
}

function revalidatedTags() {
  return (revalidateTag as jest.Mock).mock.calls.map(([tag]) => tag);
}

describe("invalidateStorefrontCache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("clears snapshot and sitemap redis prefixes on catalog invalidation", async () => {
    await invalidateStorefrontCache();

    const prefixes = (redisDelByPrefix as jest.Mock).mock.calls.map(
      ([prefix]) => prefix,
    );
    expect(prefixes).toContain("sf:snapshot:");
    expect(prefixes).toContain("sf:sitemap:");
  });

  it("revalidates the per-product group tags too", async () => {
    await invalidateStorefrontCache();
    expect(revalidatedTags()).toEqual(
      expect.arrayContaining([
        "storefront-product-details",
        "storefront-size-batch",
      ]),
    );
  });
});

describe("invalidateProductCaches", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isCatalogD1Enabled as jest.Mock).mockReturnValue(false);
    dbRows = [{ id: "p1", slug: "red-saree", featured: false }];
  });

  it("clears only the product and shared lists, leaving other pages and settings", async () => {
    await invalidateProductCaches({ productIds: ["p1"] });

    const { keys, prefixes } = clearedWith();
    expect(keys).toEqual(
      expect.arrayContaining([
        "sf:product:red-saree",
        "sf:published:red-saree",
        "sf:size:p1",
      ]),
    );
    expect(prefixes).toEqual(
      expect.arrayContaining([
        "sf:products:",
        "sf:collection:",
        "sf:size:batch:",
      ]),
    );
    expect(prefixes).not.toContain("sf:product:");
    expect(prefixes).not.toContain("sf:runtime-bundle");
    expect(prefixes).not.toContain("sf:home-banner");
    expect(prefixes).not.toContain("sf:pincode:");

    const tags = revalidatedTags();
    expect(tags).toContain("storefront-product:red-saree");
    expect(tags).toContain("storefront-products");
    expect(tags).not.toContain("storefront-settings");
    expect(tags).not.toContain("storefront-product-details");

    expect(revalidatePath).toHaveBeenCalledWith("/shop/red-saree");
    expect(redisDelByPrefix).not.toHaveBeenCalled();
    expect(triggerCatalogMirrorSync).toHaveBeenCalled();
  });

  it("also clears the previous slug", async () => {
    await invalidateProductCaches({
      productIds: ["p1"],
      previous: [{ id: "p1", slug: "old-slug", featured: false }],
    });
    expect(clearedWith().keys).toEqual(
      expect.arrayContaining(["sf:product:old-slug", "sf:product:red-saree"]),
    );
  });

  it("clears every product page when a featured product changes", async () => {
    await invalidateProductCaches({
      productIds: ["p1"],
      previous: [{ id: "p1", slug: "red-saree", featured: true }],
    });
    expect(clearedWith().prefixes).toContain("sf:product:");
    expect(revalidatedTags()).toContain("storefront-product-details");
    expect(revalidatePath).toHaveBeenCalledWith("/shop/[slug]", "page");
  });

  it("skips shared lists when lists is false", async () => {
    await invalidateProductCaches({ productIds: ["p1"], lists: false });
    const { prefixes } = clearedWith();
    expect(prefixes).toEqual(["sf:size:batch:"]);
    expect(revalidatedTags()).not.toContain("storefront-products");
    expect(triggerCatalogMirrorSync).not.toHaveBeenCalled();
  });

  it("clears again after the D1 mirror sync so stale rows are not re-cached", async () => {
    (isCatalogD1Enabled as jest.Mock).mockReturnValue(true);
    await invalidateProductCaches({ productIds: ["p1"] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(syncCatalogMirror).toHaveBeenCalled();
    expect(clearStorefrontCacheEntries).toHaveBeenCalledTimes(2);
    expect(triggerCatalogMirrorSync).not.toHaveBeenCalled();
  });
});
