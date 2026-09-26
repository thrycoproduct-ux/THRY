/**
 * Map D1 catalog rows into the ProductCard / featured GraphQL card shape.
 * Keep this adapter thin — PDP/cart stay on Supabase.
 */

import type { D1CollectionRow, D1ProductRow } from "./d1-mirror";

export type CatalogProductCardNode = {
  id: string;
  name: string;
  rating: string;
  slug: string;
  badge: string | null;
  price: string;
  discountEnabled: boolean;
  discountPercent: number | null;
  stock: number | null;
  featuredImage: {
    id: string;
    key: string | null;
    alt: string | null;
  } | null;
  collections: {
    id: string;
    label: string;
    slug: string;
  } | null;
};

export type CatalogProductsCollection = {
  edges: { node: CatalogProductCardNode }[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
};

export function mapD1ProductToCardNode(
  row: D1ProductRow,
  collectionsById: Map<string, D1CollectionRow>,
): CatalogProductCardNode {
  const collection = row.collection_id
    ? collectionsById.get(row.collection_id) ?? null
    : null;

  return {
    id: row.id,
    name: row.name,
    rating: String(row.rating ?? "5"),
    slug: row.slug,
    badge: row.badge,
    price: String(row.price ?? "0"),
    discountEnabled: Number(row.discount_enabled) === 1,
    discountPercent:
      row.discount_percent == null ? null : Number(row.discount_percent),
    stock: row.stock == null ? null : Number(row.stock),
    featuredImage: row.featured_image_id
      ? {
          id: row.featured_image_id,
          key: row.featured_image_key,
          alt: row.featured_image_alt,
        }
      : null,
    collections: collection
      ? {
          id: collection.id,
          label: collection.label,
          slug: collection.slug,
        }
      : null,
  };
}

export function mapD1ProductsToCollection(
  products: D1ProductRow[],
  collections: D1CollectionRow[],
  options?: { hasNextPage?: boolean; endCursor?: string | null },
): CatalogProductsCollection {
  const collectionsById = new Map(
    collections.map((collection) => [collection.id, collection]),
  );

  return {
    edges: products.map((product) => ({
      node: mapD1ProductToCardNode(product, collectionsById),
    })),
    pageInfo: {
      hasNextPage: Boolean(options?.hasNextPage),
      endCursor: options?.endCursor ?? null,
    },
  };
}
