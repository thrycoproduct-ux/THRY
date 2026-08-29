/**
 * Isolated no-transaction product insert test.
 * Usage: npx tsx --env-file=.env.local scripts/test-product-insert-no-tx.ts
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/supabase/schema";
import { products } from "../src/lib/supabase/schema";
import { resolveDatabaseUrl } from "../src/lib/supabase/resolve-database-url";
import { buildPostgresClientOptions } from "../src/lib/supabase/postgres-client-options";
import { insertProductWithoutTransaction } from "../src/lib/admin/product-insert";

async function main() {
  const url = resolveDatabaseUrl(process.env.DATABASE_URL);
  if (!url) throw new Error("DATABASE_URL missing");

  const client = postgres(url, buildPostgresClientOptions(1));
  const db = drizzle(client, { schema });

  const [media] = await db
    .select({ id: schema.medias.id })
    .from(schema.medias)
    .limit(1);
  if (!media?.id) throw new Error("Need at least one media row");

  const row = await insertProductWithoutTransaction(
    (productCode) => `Script test ${productCode}`,
    (identity) => ({
      id: identity.id,
      name: identity.name,
      slug: identity.slug,
      productCode: identity.productCode,
      description: "script test",
      featured: false,
      badge: null,
      rating: "4",
      price: "1",
      isDraft: true,
      stock: 0,
      collectionId: null,
      discountEnabled: false,
      discountPercent: null,
      soldAsPack: false,
      packSize: null,
      isDigital: false,
      featuredImageId: media.id,
      tags: [],
      images: [],
      totalComments: 0,
    }),
  );

  console.log("created:", row.id, row.productCode, row.slug);
  await db.delete(products).where(eq(products.id, row.id));
  console.log("deleted ok");
  await client.end({ timeout: 5 });
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
