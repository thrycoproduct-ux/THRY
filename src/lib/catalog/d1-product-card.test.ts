import {
  mapD1ProductToCardNode,
  mapD1ProductsToCollection,
} from "./d1-product-card";
import type { D1CollectionRow, D1ProductRow } from "./d1-mirror";

const collection: D1CollectionRow = {
  id: "col_1",
  label: "Silicon",
  slug: "silicon",
  title: "Silicon",
  description: "",
  sort_order: 1,
  featured_image_id: null,
  featured_image_key: null,
  featured_image_alt: null,
};

const product: D1ProductRow = {
  id: "prod_1",
  name: "Test mould",
  slug: "test-mould",
  product_code: "ST0001",
  is_draft: 0,
  description: "desc",
  featured: 1,
  badge: "new_product",
  rating: "5",
  tags: "[]",
  price: "299",
  discount_enabled: 1,
  discount_percent: 10,
  sold_as_pack: 0,
  pack_size: null,
  stock: 8,
  collection_id: "col_1",
  featured_image_id: "img_1",
  featured_image_key: "uploads/a.png",
  featured_image_alt: "alt",
  is_digital: 0,
  created_at: "2026-01-01T00:00:00Z",
  archived_at: null,
};

describe("d1-product-card mapper", () => {
  it("nests featuredImage and collections for ProductCard shape", () => {
    const node = mapD1ProductToCardNode(
      product,
      new Map([[collection.id, collection]]),
    );

    expect(node.featuredImage).toEqual({
      id: "img_1",
      key: "uploads/a.png",
      alt: "alt",
    });
    expect(node.collections).toEqual({
      id: "col_1",
      label: "Silicon",
      slug: "silicon",
    });
    expect(node.discountEnabled).toBe(true);
    expect(node.discountPercent).toBe(10);
    expect(node.price).toBe("299");
  });

  it("builds a productsCollection with empty pageInfo by default", () => {
    const collectionPayload = mapD1ProductsToCollection(
      [product],
      [collection],
    );
    expect(collectionPayload.edges).toHaveLength(1);
    expect(collectionPayload.pageInfo).toEqual({
      hasNextPage: false,
      endCursor: null,
    });
  });

  it("omits collections when collection_id is missing", () => {
    const node = mapD1ProductToCardNode(
      { ...product, collection_id: null },
      new Map([[collection.id, collection]]),
    );
    expect(node.collections).toBeNull();
  });
});
