import "server-only";

import type { ProductDetailPageQueryQuery } from "@/gql/graphql";
import { withRetry } from "@/lib/resilience";
import db from "@/lib/supabase/db";
import {
  collections,
  medias,
  productMedias,
  products,
} from "@/lib/supabase/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

type ProductCardNode = NonNullable<
  NonNullable<
    ProductDetailPageQueryQuery["recommendations"]
  >["edges"][number]["node"]
>;

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  rating: string;
  slug: string;
  badge: "new_product" | "best_sale" | "featured" | null;
  price: string;
  discountEnabled: boolean;
  discountPercent: number | null;
  stock: number | null;
  tags: string[];
  featured: boolean | null;
  createdAt: Date;
  mediaId: string | null;
  mediaKey: string | null;
  mediaAlt: string | null;
  collectionId: string | null;
  collectionLabel: string | null;
  collectionSlug: string | null;
};

function mapMedia(
  id: string | null | undefined,
  key: string | null | undefined,
  alt: string | null | undefined,
) {
  if (!id || !key) return null;
  return {
    __typename: "medias" as const,
    id,
    key,
    alt: alt ?? "",
  };
}

function mapProductCardNode(row: ProductRow): ProductCardNode {
  return {
    __typename: "products",
    id: row.id,
    name: row.name,
    description: row.description,
    rating: row.rating,
    slug: row.slug,
    badge: row.badge,
    price: row.price,
    discountEnabled: row.discountEnabled,
    discountPercent: row.discountPercent,
    stock: row.stock,
    featuredImage: mapMedia(row.mediaId, row.mediaKey, row.mediaAlt),
    collections: row.collectionId
      ? {
          __typename: "collections",
          id: row.collectionId,
          label: row.collectionLabel ?? "",
          slug: row.collectionSlug ?? "",
        }
      : null,
  };
}

const productCardSelect = {
  id: products.id,
  name: products.name,
  description: products.description,
  rating: products.rating,
  slug: products.slug,
  badge: products.badge,
  price: products.price,
  discountEnabled: products.discountEnabled,
  discountPercent: products.discountPercent,
  stock: products.stock,
  tags: products.tags,
  featured: products.featured,
  createdAt: products.createdAt,
  mediaId: medias.id,
  mediaKey: medias.key,
  mediaAlt: medias.alt,
  collectionId: collections.id,
  collectionLabel: collections.label,
  collectionSlug: collections.slug,
};

async function loadPublishedProductRow(slug: string) {
  const [row] = await withRetry(
    () =>
      db
        .select(productCardSelect)
        .from(products)
        .leftJoin(medias, eq(products.featuredImageId, medias.id))
        .leftJoin(collections, eq(products.collectionId, collections.id))
        .where(and(eq(products.slug, slug), eq(products.isDraft, false)))
        .limit(1),
    { label: "pdp:product-shell" },
  );

  return row ?? null;
}

async function loadGalleryImages(productId: string) {
  const rows = await withRetry(
    () =>
      db
        .select({
          mediaId: medias.id,
          mediaKey: medias.key,
          mediaAlt: medias.alt,
        })
        .from(productMedias)
        .innerJoin(medias, eq(productMedias.mediaId, medias.id))
        .where(eq(productMedias.productId, productId))
        .orderBy(desc(productMedias.priority)),
    { label: "pdp:product-gallery" },
  );

  return rows
    .map((row) => mapMedia(row.mediaId, row.mediaKey, row.mediaAlt))
    .filter((media): media is NonNullable<typeof media> => media !== null);
}

async function loadFeaturedRecommendations(limit: number) {
  const rows = await withRetry(
    () =>
      db
        .select(productCardSelect)
        .from(products)
        .leftJoin(medias, eq(products.featuredImageId, medias.id))
        .leftJoin(collections, eq(products.collectionId, collections.id))
        .where(and(eq(products.isDraft, false), eq(products.featured, true)))
        .orderBy(desc(products.createdAt))
        .limit(limit),
    { label: "pdp:featured-recommendations" },
  );

  return rows.map((row) => mapProductCardNode(row));
}

/**
 * PDP read path: three small Drizzle SELECTs (sequential on one pooler connection).
 * Product user comments are intentionally omitted — feature not used on storefront.
 */
export async function loadProductDetailPageFromDb(
  productSlug: string,
): Promise<ProductDetailPageQueryQuery | null> {
  const slug = productSlug.trim();
  if (!slug) return null;

  const productRow = await loadPublishedProductRow(slug);
  if (!productRow) return null;

  const galleryMedias = await loadGalleryImages(productRow.id);
  const recommendationNodes = await loadFeaturedRecommendations(4);

  const featuredImage = mapMedia(
    productRow.mediaId,
    productRow.mediaKey,
    productRow.mediaAlt,
  );

  return {
    __typename: "Query",
    productsCollection: {
      __typename: "productsConnection",
      edges: [
        {
          __typename: "productsEdge",
          node: {
            __typename: "products",
            id: productRow.id,
            name: productRow.name,
            description: productRow.description,
            rating: productRow.rating,
            price: productRow.price,
            stock: productRow.stock,
            tags: productRow.tags,
            discountEnabled: productRow.discountEnabled,
            discountPercent: productRow.discountPercent,
            featuredImage,
            collections: productRow.collectionId
              ? {
                  __typename: "collections",
                  id: productRow.collectionId,
                  label: productRow.collectionLabel ?? "",
                  slug: productRow.collectionSlug ?? "",
                }
              : null,
            images: {
              __typename: "product_mediasConnection",
              edges: galleryMedias.map((media) => ({
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
      edges: recommendationNodes.map((node) => ({
        __typename: "productsEdge" as const,
        node,
      })),
    },
  };
}

/** Batch helper for tests — maps product ids to card nodes. */
export async function loadProductCardNodesByIds(
  productIds: string[],
): Promise<ProductCardNode[]> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const rows = await db
    .select(productCardSelect)
    .from(products)
    .leftJoin(medias, eq(products.featuredImageId, medias.id))
    .leftJoin(collections, eq(products.collectionId, collections.id))
    .where(inArray(products.id, ids));

  const byId = new Map(rows.map((row) => [row.id, mapProductCardNode(row)]));
  return ids
    .map((id) => byId.get(id))
    .filter((node): node is ProductCardNode => node !== undefined);
}
