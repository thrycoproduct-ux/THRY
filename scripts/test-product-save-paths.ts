/**
 * Validate product-save DB paths locally (creates + deletes test rows).
 * Usage: npx tsx --env-file=.env.local scripts/test-product-save-paths.ts
 */
import { createId } from "@paralleldrive/cuid2";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, eq } from "drizzle-orm";
import * as schema from "../src/lib/supabase/schema";
import { products } from "../src/lib/supabase/schema";
import {
  resolveDatabaseUrl,
  resolveSessionDatabaseUrl,
} from "../src/lib/supabase/resolve-database-url";
import { buildPostgresClientOptions } from "../src/lib/supabase/postgres-client-options";
import {
  buildUniqueProductSlug,
  createNextProductCode,
  PRODUCT_CODE_LOCK_ID,
} from "../src/lib/admin/product-slug";

function redact(url: string) {
  return url.replace(/:([^:@/]+)@/, ":***@");
}

function makeTxDb() {
  const url = resolveDatabaseUrl(process.env.DATABASE_URL);
  const client = postgres(url, buildPostgresClientOptions(1));
  return { db: drizzle(client, { schema }), client };
}

async function testLabel(
  label: string,
  fn: () => Promise<void>,
  options?: { expectFail?: boolean },
) {
  process.stdout.write(`\n[${label}] ... `);
  try {
    await fn();
    if (options?.expectFail) {
      console.log("UNEXPECTED PASS");
      return false;
    }
    console.log("OK");
    return true;
  } catch (error) {
    if (options?.expectFail) {
      console.log("expected fail");
      return true;
    }
    console.log("FAIL");
    console.error(error);
    return false;
  }
}

async function main() {
  const txUrl = resolveDatabaseUrl(process.env.DATABASE_URL);
  const sessionUrl = resolveSessionDatabaseUrl(process.env.DATABASE_URL);
  if (!txUrl) {
    console.error("DATABASE_URL missing in .env.local");
    process.exit(1);
  }

  console.log("transaction pooler:", redact(txUrl));
  console.log("session pooler:    ", redact(sessionUrl));

  const { db, client: txClient } = makeTxDb();

  const [media] = await db.execute<{ id: string }>(
    sql`select id from medias order by created_at desc limit 1`,
  );
  const featuredImageId = media?.id;
  if (!featuredImageId) {
    console.error("No media row found — upload one in admin first.");
    process.exit(1);
  }

  await testLabel("6543 simple select", async () => {
    const rows = await db.execute(sql`select 1 as ok`);
    if (!rows.length) throw new Error("empty");
  });

  await testLabel(
    "6543 drizzle transaction (expect fail)",
    async () => {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
      });
    },
    { expectFail: true },
  );

  await testLabel("5432 session transaction", async () => {
    const client = postgres(sessionUrl, {
      prepare: false,
      max: 1,
      max_pipeline: 0,
      connect_timeout: 10,
    });
    const sessionDb = drizzle(client, { schema });
    try {
      await sessionDb.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
      });
    } finally {
      await client.end({ timeout: 5 }).catch(() => undefined);
    }
  });

  let sessionId: string | null = null;
  const sessionOk = await testLabel("5432 session product-create shape", async () => {
    const pgClient = postgres(sessionUrl, {
      prepare: false,
      max: 1,
      max_pipeline: 0,
      connect_timeout: 10,
    });
    const sessionDb = drizzle(pgClient, { schema });
    try {
      await sessionDb.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(${PRODUCT_CODE_LOCK_ID})`,
        );
        const productCode = await createNextProductCode(tx);
        const name = `Local session test ${productCode}`;
        const slug = await buildUniqueProductSlug(tx, name, productCode);
        sessionId = createId();
        const [row] = await tx
          .insert(products)
          .values({
            id: sessionId,
            name,
            slug,
            productCode,
            description: "local session test",
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
            featuredImageId,
            tags: [],
            images: [],
            totalComments: 0,
          })
          .returning({ id: products.id });
        if (!row) throw new Error("no row");
      });
    } finally {
      await pgClient.end({ timeout: 5 }).catch(() => undefined);
    }
  });

  if (sessionId) {
    await db.delete(products).where(eq(products.id, sessionId));
    console.log(`cleaned session test product ${sessionId}`);
  }

  let noTxId: string | null = null;
  const noTxOk = await testLabel("6543 no-transaction multi-query insert", async () => {
    const productCode = await createNextProductCode(db);
    const name = `Local no-tx ${productCode}`;
    const slug = await buildUniqueProductSlug(db, name, productCode);
    noTxId = createId();
    const [row] = await db
      .insert(products)
      .values({
        id: noTxId,
        name,
        slug,
        productCode,
        description: "local no-tx test",
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
        featuredImageId,
        tags: [],
        images: [],
        totalComments: 0,
      })
      .returning({ id: products.id });
    if (!row) throw new Error("no row");
  });

  if (noTxId) {
    await db.delete(products).where(eq(products.id, noTxId));
    console.log(`cleaned no-tx product ${noTxId}`);
  }

  await txClient.end({ timeout: 5 }).catch(() => undefined);

  console.log("\nSummary:");
  console.log("  5432 session create:", sessionOk ? "pass" : "fail");
  console.log("  6543 no-tx create:  ", noTxOk ? "pass" : "fail");

  if (!sessionOk && !noTxOk) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
