import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env.mjs";
import * as schema from "./schema";
import { resolveSessionDatabaseUrl } from "./resolve-database-url";
import { buildPostgresClientOptions } from "./postgres-client-options";

export type TransactionalDatabase = PostgresJsDatabase<typeof schema>;

type GlobalDb = typeof globalThis & {
  __thryPgTransactionalDb?: TransactionalDatabase;
};

const connectionString = resolveSessionDatabaseUrl(env.DATABASE_URL);

function createTransactionalDb(): TransactionalDatabase {
  const sql = postgres(connectionString, buildPostgresClientOptions(1));
  return drizzle(sql, { schema });
}

/**
 * Session-pooler client for `db.transaction()` workloads (stock release, checkout).
 * Avoids postgres.js `onclose` / `queue` races on the transaction pooler (6543).
 */
export function getTransactionalDb(): TransactionalDatabase {
  const g = globalThis as GlobalDb;
  if (!g.__thryPgTransactionalDb) {
    g.__thryPgTransactionalDb = createTransactionalDb();
  }
  return g.__thryPgTransactionalDb;
}
