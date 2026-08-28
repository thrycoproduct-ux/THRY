import db from "@/lib/supabase/db";
import { collections, products } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import {
  CACHE_TAGS,
  STOREFRONT_STATIC_REVALIDATE_SECONDS,
} from "@/lib/cache/constants";
import { withStorefrontCache } from "@/lib/cache/storefront-cache";

export async function getPublishedProductSlugs() {
  return withStorefrontCache(
    "sf:sitemap:products",
    async () => {
      const rows = await db
        .select({
          slug: products.slug,
          createdAt: products.createdAt,
        })
        .from(products)
        .where(eq(products.isDraft, false))
        .orderBy(products.createdAt);

      return rows;
    },
    {
      revalidate: STOREFRONT_STATIC_REVALIDATE_SECONDS,
      tags: [CACHE_TAGS.products],
    },
  );
}

export async function getCollectionSlugs() {
  return withStorefrontCache(
    "sf:sitemap:collections",
    async () => {
      const rows = await db
        .select({
          slug: collections.slug,
          label: collections.label,
        })
        .from(collections)
        .orderBy(collections.order);

      return rows;
    },
    {
      revalidate: STOREFRONT_STATIC_REVALIDATE_SECONDS,
      tags: [CACHE_TAGS.collections],
    },
  );
}
