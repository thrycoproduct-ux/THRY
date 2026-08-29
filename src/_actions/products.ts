"use server";

import db from "@/lib/supabase/db";
import { runSessionTransaction } from "@/lib/supabase/transactional-db";
import { mapProductSaveError } from "@/lib/supabase/pooler-errors";
import { productMedias, products } from "@/lib/supabase/schema";
import { requireAdminActionUser } from "@/lib/auth/require-admin";
import { invalidateStorefrontCache } from "@/lib/cache/invalidate-storefront";
import {
  buildUniqueProductSlug,
  PRODUCT_CODE_LOCK_ID,
} from "@/lib/admin/product-slug";
import {
  buildBulkProductInsertValues,
  type NormalizedBulkDraftShared,
} from "@/lib/admin/normalize-bulk-product-shared";
import {
  createProductRecord,
  updateProductRecord,
  type ProductImageOptions,
} from "@/lib/admin/save-product";
import { eq, inArray, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { revalidatePath } from "next/cache";

function revalidateProductCatalogPaths() {
  // Keep this light on Cloudflare Workers — broad layout revalidation can 1102
  // right after admin saves and surfaces as a vague "Server Components" error.
  try {
    revalidatePath("/admin/products");
    revalidatePath("/shop");
    revalidatePath("/featured");
  } catch (error) {
    console.error("[products] revalidatePath failed:", error);
  }
}

async function softInvalidateStorefrontCache() {
  try {
    await invalidateStorefrontCache();
  } catch (error) {
    console.error("[products] invalidateStorefrontCache failed:", error);
  }
}

export const createProductAction = async (
  product: Parameters<typeof createProductRecord>[0],
  options?: ProductImageOptions,
) => {
  await requireAdminActionUser();
  const created = await createProductRecord(product, options);
  revalidateProductCatalogPaths();
  void softInvalidateStorefrontCache();
  return [created];
};

export const updateProductAction = async (
  productId: string,
  product: Parameters<typeof updateProductRecord>[1],
  options?: ProductImageOptions,
) => {
  await requireAdminActionUser();
  const updated = await updateProductRecord(productId, product, options);
  revalidateProductCatalogPaths();
  void softInvalidateStorefrontCache();
  return [updated];
};

export const getProductsByIds = async (productIds: string[]) => {
  return await db
    .select()
    .from(products)
    .where(inArray(products.id, productIds));
};

type DraftSourceMedia = {
  mediaId: string;
  originalFileName: string;
};

export type BulkDraftSharedData = NormalizedBulkDraftShared;

export type BulkDraftCreateResult = {
  id: string;
  productCode: string;
  name: string;
  slug: string;
};

function getFileNameBase(fileName: string) {
  const cleaned = fileName.replace(/\.[^/.]+$/, "").trim();
  return cleaned || "Product";
}

const DEFAULT_BULK_SHARED: NormalizedBulkDraftShared = {
  baseName: "Product",
  description: "Draft product",
  isDraft: true,
  collectionId: "",
  badge: null,
  rating: "4",
  price: "0",
  stock: 0,
  discountEnabled: false,
  discountPercent: null,
  soldAsPack: false,
  packSize: null,
};

export async function createDraftProductsFromMedia(
  mediaItems: DraftSourceMedia[],
  shared?: BulkDraftSharedData,
): Promise<BulkDraftCreateResult[]> {
  await requireAdminActionUser();
  if (mediaItems.length === 0) return [];

  const normalizedShared = shared ?? DEFAULT_BULK_SHARED;
  if (!String(normalizedShared.collectionId ?? "").trim()) {
    throw new Error("Catalog is required.");
  }

  try {
    const createdProducts = await runSessionTransaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${PRODUCT_CODE_LOCK_ID})`,
      );

      const lastCodeRows = await tx.execute<{ product_code: string | null }>(
        sql`select product_code
          from products
          where product_code like 'ST%'
          order by product_code desc
          limit 1`,
      );
      const lastCode = lastCodeRows[0]?.product_code ?? null;
      const lastNumber = Number.parseInt(
        lastCode?.replace(/^ST/i, "") ?? "0",
        10,
      );
      const start = Number.isFinite(lastNumber) ? lastNumber : 0;

      const created: BulkDraftCreateResult[] = [];

      for (let index = 0; index < mediaItems.length; index += 1) {
        const currentNumber = start + index + 1;
        const productCode = `ST${String(currentNumber).padStart(6, "0")}`;
        const fileNameBase = getFileNameBase(
          mediaItems[index].originalFileName,
        );
        const nameBase = (normalizedShared.baseName || fileNameBase).trim();
        const productName = `${nameBase} ${productCode}`;
        const slug = await buildUniqueProductSlug(tx, productName, productCode);

        const insertValues = buildBulkProductInsertValues({
          shared: normalizedShared,
          productName,
          slug,
          productCode,
          featuredImageId: mediaItems[index].mediaId,
        });

        createInsertSchema(products).parse(insertValues);

        const [row] = await tx.insert(products).values(insertValues).returning({
          id: products.id,
          name: products.name,
          slug: products.slug,
          productCode: products.productCode,
        });

        await tx.insert(productMedias).values({
          productId: row.id,
          mediaId: mediaItems[index].mediaId,
          priority: 1,
        });

        created.push({
          id: row.id,
          name: row.name,
          slug: row.slug,
          productCode: row.productCode ?? productCode,
        });
      }

      return created;
    }, "product-bulk-draft");

    revalidateProductCatalogPaths();
    await invalidateStorefrontCache();
    return createdProducts;
  } catch (error) {
    throw mapProductSaveError(error);
  }
}
