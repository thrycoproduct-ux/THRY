jest.mock("../supabase/db", () => ({
  __esModule: true,
  default: {
    select: jest.fn(),
  },
}));

import db from "../supabase/db";
import { loadProductDetailPageFromDb } from "./product-detail-drizzle.server";

const mockDb = db as unknown as { select: jest.Mock };

function mockSelectChain(rows: unknown[], terminal: "limit" | "orderBy" = "limit") {
  const chain: Record<string, jest.Mock> = {
    from: jest.fn(),
    leftJoin: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
  };
  for (const key of Object.keys(chain)) {
    chain[key].mockReturnValue(chain);
  }
  chain[terminal].mockResolvedValue(rows);
  mockDb.select.mockReturnValueOnce(chain);
  return chain;
}

describe("loadProductDetailPageFromDb", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null for empty slug without querying the database", async () => {
    const result = await loadProductDetailPageFromDb("   ");
    expect(result).toBeNull();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("loads shell, gallery, comments, and recommendations sequentially", async () => {
    mockSelectChain([
      {
        id: "prod-1",
        name: "Kolam Stencil",
        description: "A stencil",
        rating: "4.5",
        slug: "kolam-stencil",
        badge: null,
        price: "199.00",
        discountEnabled: false,
        discountPercent: null,
        stock: 12,
        tags: ["craft"],
        totalComments: 2,
        featured: false,
        createdAt: new Date("2026-01-01"),
        mediaId: "media-1",
        mediaKey: "products/kolam.jpg",
        mediaAlt: "Kolam",
        collectionId: "col-1",
        collectionLabel: "Kolam",
        collectionSlug: "kolam",
      },
    ]);
    mockSelectChain(
      [
        {
          mediaId: "media-2",
          mediaKey: "products/kolam-2.jpg",
          mediaAlt: "Alt 2",
        },
      ],
      "orderBy",
    );
    mockSelectChain(
      [
        {
          id: "comment-1",
          comment: "Nice product",
          profileName: "Ravi",
        },
      ],
      "limit",
    );
    mockSelectChain(
      [
        {
          id: "rec-1",
        name: "Featured item",
        description: null,
        rating: "4.0",
        slug: "featured-item",
        badge: "featured",
        price: "99.00",
        discountEnabled: false,
        discountPercent: null,
        stock: 5,
        tags: [],
        totalComments: 0,
        featured: true,
        createdAt: new Date("2026-01-02"),
        mediaId: "media-3",
        mediaKey: "products/featured.jpg",
        mediaAlt: "Featured",
        collectionId: null,
        collectionLabel: null,
        collectionSlug: null,
      },
    ]);

    const result = await loadProductDetailPageFromDb("kolam-stencil");

    expect(mockDb.select).toHaveBeenCalledTimes(4);
    expect(result?.productsCollection?.edges[0]?.node.name).toBe("Kolam Stencil");
    expect(result?.productsCollection?.edges[0]?.node.images?.edges).toHaveLength(
      1,
    );
    expect(
      result?.productsCollection?.edges[0]?.node.commentsCollection?.edges[0]
        ?.node.comment,
    ).toBe("Nice product");
    expect(result?.recommendations?.edges[0]?.node.slug).toBe("featured-item");
  });
});
