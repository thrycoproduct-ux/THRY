import { insertProductWithoutTransaction } from "@/lib/admin/product-insert";
import { normalizeProductFormPayload } from "@/lib/admin/normalize-product-form-payload";
import {
  normalizeProductImageMediaIds,
  syncProductGalleryImages,
} from "@/lib/admin/product-gallery";
import db from "@/lib/supabase/db";
import { mapProductSaveError } from "@/lib/supabase/pooler-errors";
import { withRetry } from "@/lib/resilience";
import { InsertProducts, products } from "@/lib/supabase/schema";
import { deleteObjects } from "@/lib/s3";
import { isValidDigitalObjectKey } from "@/lib/products/digital-product";
import { eq } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

export type ProductImageOptions = {
  /** Ordered media ids: first = featured/main, rest = gallery (max 5). */
  imageMediaIds?: string[];
};

function resolveFeaturedAndGallery(
  product: InsertProducts,
  options?: ProductImageOptions,
) {
  const fromOptions = options?.imageMediaIds
    ? normalizeProductImageMediaIds(options.imageMediaIds)
    : [];

  if (fromOptions.length > 0) {
    return {
      featuredImageId: fromOptions[0],
      orderedMediaIds: fromOptions,
    };
  }

  const featuredImageId = String(product.featuredImageId ?? "").trim() || null;
  return {
    featuredImageId,
    orderedMediaIds: featuredImageId ? [featuredImageId] : [],
  };
}

/** Drop client-only / DB-owned fields before insert/update. */
function toWritableProductFields(
  product: InsertProducts,
  featuredImageId: string,
) {
  const normalized = normalizeProductFormPayload({
    ...product,
    featuredImageId,
  });

  return {
    name: normalized.name,
    description: normalized.description,
    featured: normalized.featured,
    badge: normalized.badge,
    rating: normalized.rating,
    price: normalized.price,
    isDraft: normalized.isDraft,
    stock: normalized.stock,
    collectionId: normalized.collectionId ?? null,
    discountEnabled: normalized.discountEnabled,
    discountPercent: normalized.discountPercent,
    soldAsPack: normalized.soldAsPack,
    packSize: normalized.packSize,
    isDigital: Boolean(normalized.isDigital),
    digitalFileKey: normalized.digitalFileKey ?? null,
    digitalFileName: normalized.digitalFileName ?? null,
    digitalFileSize: normalized.digitalFileSize ?? null,
    digitalContentType: normalized.digitalContentType ?? null,
    featuredImageId,
    tags: [] as string[],
    images: Array.isArray(normalized.images) ? normalized.images : [],
    totalComments:
      typeof normalized.totalComments === "number"
        ? normalized.totalComments
        : 0,
  };
}

/** Plain JSON-safe product for API / client forms (no Date / Decimal surprises). */
export function serializeProductRow<T extends Record<string, unknown>>(row: T) {
  return JSON.parse(
    JSON.stringify(row, (_key, value) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    }),
  ) as T;
}

export async function createProductRecord(
  product: InsertProducts,
  options?: ProductImageOptions,
) {
  const { featuredImageId, orderedMediaIds } = resolveFeaturedAndGallery(
    product,
    options,
  );
  if (!featuredImageId) {
    throw new Error("Select at least one product image.");
  }

  const base = toWritableProductFields(product, featuredImageId);

  try {
    const created = await insertProductWithoutTransaction(
      () => base.name,
      (identity) => ({
        ...base,
        id: identity.id,
        productCode: identity.productCode,
        slug: identity.slug,
      }),
    );

    try {
      await syncProductGalleryImages(created.id, orderedMediaIds);
    } catch (error) {
      console.error("[products] gallery sync failed after create:", error);
    }

    return serializeProductRow(created as unknown as Record<string, unknown>);
  } catch (error) {
    throw mapProductSaveError(error);
  }
}

export async function updateProductRecord(
  productId: string,
  product: InsertProducts,
  options?: ProductImageOptions,
) {
  try {
    const existing = await withRetry(
      async () => {
        const [row] = await db
          .select({
            slug: products.slug,
            productCode: products.productCode,
            digitalFileKey: products.digitalFileKey,
          })
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);
        return row ?? null;
      },
      { label: "product-update-load" },
    );

    if (!existing) {
      throw new Error("Product not found.");
    }

    const { featuredImageId, orderedMediaIds } = resolveFeaturedAndGallery(
      product,
      options,
    );
    if (!featuredImageId) {
      throw new Error("Select at least one product image.");
    }

    const base = toWritableProductFields(product, featuredImageId);
    const values = {
      ...base,
      slug: existing.slug,
      productCode: existing.productCode,
    };

    createInsertSchema(products).parse(values);

    const updated = await withRetry(
      async () => {
        const [row] = await db
          .update(products)
          .set(values)
          .where(eq(products.id, productId))
          .returning();
        if (!row) {
          throw new Error("Product was not updated.");
        }
        return row;
      },
      { label: "product-update" },
    );

    const previousKey = String(existing.digitalFileKey ?? "").trim();
    const nextKey = String(values.digitalFileKey ?? "").trim();
    if (
      previousKey &&
      previousKey !== nextKey &&
      isValidDigitalObjectKey(previousKey)
    ) {
      try {
        await deleteObjects({ keys: [previousKey] });
      } catch (error) {
        console.error("[products] digital file cleanup failed:", error);
      }
    }

    try {
      await syncProductGalleryImages(productId, orderedMediaIds);
    } catch (error) {
      console.error("[products] gallery sync failed after update:", error);
    }

    return serializeProductRow(updated as unknown as Record<string, unknown>);
  } catch (error) {
    throw mapProductSaveError(error);
  }
}
