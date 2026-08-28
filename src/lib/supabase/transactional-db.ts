import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env.mjs";
import { withRetry } from "@/lib/resilience";
import * as schema from "./schema";
import { resolveSessionDatabaseUrl } from "./resolve-database-url";

export type TransactionalDatabase = PostgresJsDatabase<typeof schema>;

const connectionString = resolveSessionDatabaseUrl(env.DATABASE_URL);

const SESSION_CLIENT_OPTIONS = {
  prepare: false,
  max: 1,
  max_pipeline: 0,
  idle_timeout: 5,
  connect_timeout: 10,
  max_lifetime: 20,
  connection: {
    statement_timeout: 15000,
  },
} as const;

/**
 * Run work that needs `BEGIN` on a **fresh** session-pooler client, then close
 * it. A shared singleton + postgres.js `transaction()` races after the pooler
 * recycles the socket (`Cannot read properties of undefined (reading 'queue')`).
 */
export async function runSessionTransaction<T>(
  fn: (tx: TransactionalDatabase) => Promise<T>,
  label = "session-tx",
): Promise<T> {
  return withRetry(
    async () => {
      const client = postgres(connectionString, SESSION_CLIENT_OPTIONS);
      const sessionDb = drizzle(client, { schema });
      try {
        return await sessionDb.transaction(async (tx) =>
          fn(tx as TransactionalDatabase),
        );
      } finally {
        await client.end({ timeout: 5 }).catch(() => undefined);
      }
    },
    { label, attempts: 3 },
  );
}
