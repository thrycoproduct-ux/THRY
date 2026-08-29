import { createId } from "@paralleldrive/cuid2";
import {
  buildUniqueProductSlug,
  createNextProductCode,
} from "@/lib/admin/product-slug";
import { isTransientError, withRetry } from "@/lib/resilience";
import {
  isPoolerSocketError,
  isUniqueViolation,
  mapProductSaveError,
} from "@/lib/supabase/pooler-errors";
import db from "@/lib/supabase/db";
import { products, type InsertProducts } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

const MAX_INSERT_ATTEMPTS = 8;

export type AllocatedProductIdentity = {
  id: string;
  productCode: string;
  slug: string;
  name: string;
};

export function shouldRetryProductCreate(error: unknown): boolean {
  return (
    isUniqueViolation(error) ||
    isPoolerSocketError(error) ||
    isTransientError(error)
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function recoverProductById(id: string) {
  try {
    const [row] = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);
    return row ?? null;
  } catch (error) {
    console.warn(
      "[products] lookup after insert fault failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Insert a product with **one statement** on the default 6543 client.
 * postgres.js `BEGIN` crashes on both pooler ports here (onclose / queue).
 * Unique races retry with a new code; socket faults recover by the client-generated id.
 */
export async function insertProductWithoutTransaction(
  resolveName: (productCode: string) => string,
  buildValues: (identity: AllocatedProductIdentity) => InsertProducts,
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_INSERT_ATTEMPTS; attempt += 1) {
    const id = createId();
    const productCode = await withRetry(() => createNextProductCode(db), {
      label: "product-next-code",
      attempts: 3,
    });
    const name = resolveName(productCode);
    const slug = await withRetry(
      () => buildUniqueProductSlug(db, name, productCode),
      { label: "product-unique-slug", attempts: 3 },
    );
    const values = {
      ...buildValues({ id, productCode, slug, name }),
      id,
      productCode,
      slug,
    };

    createInsertSchema(products).parse(values);

    try {
      const [row] = await db.insert(products).values(values).returning();
      if (!row) {
        throw new Error("Product was not created.");
      }
      return row;
    } catch (error) {
      lastError = error;
      const recovered = await recoverProductById(id);
      if (recovered) return recovered;

      if (!shouldRetryProductCreate(error) || attempt === MAX_INSERT_ATTEMPTS) {
        throw mapProductSaveError(error);
      }

      await sleep(40 * attempt);
    }
  }

  throw mapProductSaveError(lastError);
}
