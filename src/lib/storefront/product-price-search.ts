import type { SearchQuery, SearchQueryVariables } from "@/gql/graphql";
import { OrderByDirection } from "@/gql/graphql";
import db from "@/lib/supabase/db";
import { getEffectiveProductPrice } from "@/lib/products/discount";
import { collections, medias, products } from "@/lib/supabase/schema";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  effectivePriceInRangeFilter,
  parsePaginationOffset,
} from "./effective-price";
import { categorizedPublishedProductConditions } from "./categorized-products";
import type { StorefrontProductSearchVariables } from "./search-params";
import { normalizeStorefrontSearchTerm } from "./search-utils";

type ProductCardNode = NonNullable<
  SearchQuery["productsCollection"]
>["edges"][number]["node"];

type ProductRow = {
  id: string;
  name: string;
  rating: string;
  slug: string;
  badge: "new_product" | "best_sale" | "featured" | null;
  price: string;
  discountEnabled: boolean;
  discountPercent: number | null;
  stock: number | null;
  featured: boolean | null;
  createdAt: Date;
  mediaId: string;
  mediaKey: string;
  mediaAlt: string | null;
  collectionId: string | null;
  collectionLabel: string | null;
  collectionSlug: string | null;
};

function mapRowToProductCardNode(row: ProductRow): ProductCardNode {
  return {
    id: row.id,
    name: row.name,
    rating: row.rating,
    slug: row.slug,
    badge: row.badge,
    price: row.price,
    discountEnabled: row.discountEnabled,
    discountPercent: row.discountPercent,
    stock: row.stock,
    featuredImage: {
      id: row.mediaId,
      key: row.mediaKey,
      alt: row.mediaAlt,
    },
    collections: row.collectionId
      ? {
          id: row.collectionId,
          label: row.collectionLabel ?? "",
          slug: row.collectionSlug ?? "",
        }
      : null,
  };
}

function compareProducts(
  a: ProductRow,
  b: ProductRow,
  orderBy: SearchQueryVariables["orderBy"],
): number {
  const rules = Array.isArray(orderBy)
    ? orderBy
    : orderBy
      ? [orderBy]
      : [{ created_at: OrderByDirection.DescNullsLast }];

  for (const rule of rules) {
    if ("price" in rule && rule.price) {
      const diff = getEffectiveProductPrice(a) - getEffectiveProductPrice(b);
      if (diff !== 0) {
        return rule.price.includes("Desc") ? -diff : diff;
      }
    }
    if ("created_at" in rule && rule.created_at) {
      const diff = a.createdAt.getTime() - b.createdAt.getTime();
      if (diff !== 0) {
        return rule.created_at.includes("Desc") ? -diff : diff;
      }
    }
    if ("name" in rule && rule.name) {
      const diff = a.name.localeCompare(b.name);
      if (diff !== 0) {
        return rule.name.includes("Desc") ? -diff : diff;
      }
    }
    if ("featured" in rule && rule.featured) {
      const aFeatured = a.featured ? 1 : 0;
      const bFeatured = b.featured ? 1 : 0;
      const diff = aFeatured - bFeatured;
      if (diff !== 0) {
        return rule.featured.includes("Desc") ? -diff : diff;
      }
    }
  }

  return a.name.localeCompare(b.name);
}

export async function fetchProductsByEffectivePriceRange(
  variables: StorefrontProductSearchVariables,
): Promise<SearchQuery["productsCollection"]> {
  const min = Number(variables.lower);
  const max = Number(variables.upper);
  const priceFilter = effectivePriceInRangeFilter(min, max);

  if (!priceFilter) {
    return {
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    };
  }

  const conditions: SQL[] = [
    categorizedPublishedProductConditions()!,
    priceFilter,
  ];

  if (variables.collections?.length) {
    conditions.push(inArray(products.collectionId, variables.collections));
  }

  const searchTerm = normalizeStorefrontSearchTerm(variables.search);
  if (searchTerm) {
    const pattern = `%${searchTerm}%`;
    conditions.push(
      or(
        sql`${products.name} ILIKE ${pattern}`,
        sql`${products.slug} ILIKE ${pattern}`,
        sql`${products.description} ILIKE ${pattern}`,
      )!,
    );
  }

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      rating: products.rating,
      slug: products.slug,
      badge: products.badge,
      price: products.price,
      discountEnabled: products.discountEnabled,
      discountPercent: products.discountPercent,
      stock: products.stock,
      featured: products.featured,
      createdAt: products.createdAt,
      mediaId: medias.id,
      mediaKey: medias.key,
      mediaAlt: medias.alt,
      collectionId: collections.id,
      collectionLabel: collections.label,
      collectionSlug: collections.slug,
    })
    .from(products)
    .innerJoin(collections, eq(products.collectionId, collections.id))
    .innerJoin(medias, eq(products.featuredImageId, medias.id))
    .where(and(...conditions));

  const sorted = [...rows].sort((a, b) =>
    compareProducts(a, b, variables.orderBy),
  );

  const offset = parsePaginationOffset(variables.after);
  const page = sorted.slice(offset, offset + variables.first);
  const nextOffset = offset + page.length;

  return {
    edges: page.map((row) => ({ node: mapRowToProductCardNode(row) })),
    pageInfo: {
      hasNextPage: nextOffset < sorted.length,
      endCursor: nextOffset < sorted.length ? String(nextOffset) : null,
    },
  };
}
