/**
 * Map D1 catalog rows into the ProductCard / featured GraphQL card shape.
 * Keep cart/checkout on live Supabase.
 */

import type { D1CollectionRow, D1GalleryImage, D1ProductRow } from "./d1-mirror";
import type { ProductDetailPageData } from "@/lib/storefront/product-detail-page.types";

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

function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((t) => String(t));
    }
  } catch {
    // ignore
  }
  return [];
}

function mapMedia(id: string | null | undefined, key: string | null | undefined, alt: string | null | undefined) {
  if (!id || !key) return null;
  return {
    __typename: "medias" as const,
    id,
    key,
    alt: alt ?? "",
  };
}

function mapBadge(
  badge: string | null,
): "new_product" | "best_sale" | "featured" | null {
  if (badge === "new_product" || badge === "best_sale" || badge === "featured") {
    return badge;
  }
  return null;
}

/**
 * Map D1 product + gallery + recommendations into ProductDetailPageData.
 */
export function mapD1ProductToDetailPage(
  product: D1ProductRow,
  gallery: D1GalleryImage[],
  collections: D1CollectionRow[],
  recommendations: D1ProductRow[],
): ProductDetailPageData {
  const collectionsById = new Map(
    collections.map((collection) => [collection.id, collection]),
  );
  const collection = product.collection_id
    ? collectionsById.get(product.collection_id) ?? null
    : null;

  const featuredImage = mapMedia(
    product.featured_image_id,
    product.featured_image_key,
    product.featured_image_alt,
  );

  const galleryMedias = gallery
    .map((g) => mapMedia(g.id, g.key, g.alt))
    .filter((m): m is NonNullable<typeof m> => m !== null);

  // Prefer gallery; if empty, show featured so PDP is never imageless.
  const imageMedias =
    galleryMedias.length > 0
      ? galleryMedias
      : featuredImage
        ? [featuredImage]
        : [];

  return {
    __typename: "Query",
    productsCollection: {
      __typename: "productsConnection",
      edges: [
        {
          __typename: "productsEdge",
          node: {
            __typename: "products",
            id: product.id,
            name: product.name,
            description: product.description,
            rating: String(product.rating ?? "5"),
            price: String(product.price ?? "0"),
            stock: product.stock == null ? null : Number(product.stock),
            tags: parseTags(product.tags),
            discountEnabled: Number(product.discount_enabled) === 1,
            discountPercent:
              product.discount_percent == null
                ? null
                : Number(product.discount_percent),
            featuredImage,
            collections: collection
              ? {
                  __typename: "collections",
                  id: collection.id,
                  label: collection.label,
                  slug: collection.slug,
                }
              : null,
            images: {
              __typename: "product_mediasConnection",
              edges: imageMedias.map((media) => ({
                __typename: "product_mediasEdge" as const,
                node: {
                  __typename: "product_medias" as const,
                  media,
                },
              })),
            },
          },
        },
      ],
    },
    recommendations: {
      __typename: "productsConnection",
      edges: recommendations
        .filter((r) => r.id !== product.id)
        .slice(0, 4)
        .map((row) => {
          const card = mapD1ProductToCardNode(row, collectionsById);
          return {
            __typename: "productsEdge" as const,
            node: {
              __typename: "products" as const,
              id: card.id,
              name: card.name,
              description: row.description,
              rating: card.rating,
              slug: card.slug,
              badge: mapBadge(card.badge),
              price: card.price,
              discountEnabled: card.discountEnabled,
              discountPercent: card.discountPercent,
              stock: card.stock,
              featuredImage: card.featuredImage
                ? {
                    __typename: "medias" as const,
                    id: card.featuredImage.id,
                    key: card.featuredImage.key ?? "",
                    alt: card.featuredImage.alt ?? "",
                  }
                : null,
              collections: card.collections
                ? {
                    __typename: "collections" as const,
                    id: card.collections.id,
                    label: card.collections.label,
                    slug: card.collections.slug,
                  }
                : null,
            },
          };
        }),
    },
  };
}

/** Map D1 collections into AllCollectionsQuery connection shape. */
export function mapD1CollectionsToConnection(collections: D1CollectionRow[]) {
  return {
    edges: collections.map((c) => ({
      node: {
        id: c.id,
        label: c.label,
        slug: c.slug,
        featuredImage: c.featured_image_key
          ? {
              key: c.featured_image_key,
              alt: c.featured_image_alt,
            }
          : null,
      },
    })),
  };
}
