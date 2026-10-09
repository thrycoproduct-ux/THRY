import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import {
  resolveDatabaseUrl,
  resolveSessionDatabaseUrl,
} from "../src/lib/supabase/resolve-database-url";

const name = process.argv[2] ?? "";
const raw = process.env.DATABASE_URL ?? "";
const txUrl = resolveDatabaseUrl(raw);
const sessionUrl = resolveSessionDatabaseUrl(raw);

function clientFor(url: string) {
  return postgres(url, {
    prepare: false,
    max: 1,
    max_pipeline: 0,
    fetch_types: false,
    connect_timeout: 10,
    idle_timeout: 5,
    max_lifetime: 20,
    connection: { statement_timeout: 8000 },
  });
}

async function run() {
  const url = name.startsWith("session-") ? sessionUrl : txUrl;
  const client = clientFor(url);
  try {
    if (name === "tx-select" || name === "session-select") {
      const rows = await client`select 1 as ok`;
      if (rows[0]?.ok !== 1) throw new Error("bad select");
      console.log("select 1 ok");
      return;
    }

    if (name === "tx-count-products") {
      const rows = await client`select count(*)::int as n from products`;
      console.log(`products=${rows[0]?.n}`);
      return;
    }

    if (name === "tx-begin" || name === "session-begin") {
      await client.begin(async (tx) => {
        await tx`select 1 as ok`;
      });
      console.log("begin/commit ok");
      return;
    }

    if (name === "tx-drizzle-tx" || name === "session-drizzle-tx") {
      const db = drizzle(client);
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(873214)`);
        await tx.execute(sql`select 1 as ok`);
      });
      console.log("drizzle transaction ok");
      return;
    }

    throw new Error(`unknown case ${name}`);
  } finally {
    await client.end({ timeout: 5 }).catch(() => undefined);
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message.slice(0, 180));
    process.exit(1);
  });
