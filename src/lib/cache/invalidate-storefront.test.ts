import { redisDelByPrefix } from "./redis";

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));

jest.mock("../admin/getAdminProductsList", () => ({
  ADMIN_PRODUCTS_LIST_TAG: "admin-products-list",
}));

jest.mock("./redis", () => ({
  redisDelByPrefix: jest.fn(async () => undefined),
}));

jest.mock("./storefront-cache", () => ({
  clearStorefrontMemoryCache: jest.fn(),
}));

import { invalidateStorefrontCache } from "./invalidate-storefront";

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
});
