import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { cache } from "react";
import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "@/env.mjs";
import * as schema from "./schema";
import { resolveDatabaseUrl } from "./resolve-database-url";

const connectionString = resolveDatabaseUrl(env.DATABASE_URL);

if (!connectionString) {
  console.log("🔴 no database URL");
}

export type AppDatabase = PostgresJsDatabase<typeof schema>;

type GlobalDb = typeof globalThis & {
  __thryPgDb?: AppDatabase;
};

/**
 * Cloudflare Workers forbid reusing TCP/DB I/O across requests.
 * Vercel Node isolates must use a singleton (max: 1) or they exhaust
 * Supabase pooler client limits (EMAXCONN ~200).
 */
function isCloudflareWorkerRuntime(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers"
  );
}

function createPostgresClient(max: number) {
  return postgres(connectionString, {
    prepare: false,
    max,
    idle_timeout: max === 1 ? 20 : 5,
    connect_timeout: 8,
    max_lifetime: max === 1 ? 60 * 30 : 30,
    connection: {
      statement_timeout: 8000,
    },
  });
}

function createDb(max = 5): AppDatabase {
  return drizzle(createPostgresClient(max), { schema });
}

function getSingletonDb(): AppDatabase {
  const g = globalThis as GlobalDb;
  if (!g.__thryPgDb) {
    g.__thryPgDb = createDb(1);
  }
  return g.__thryPgDb;
}

const requestDb = new AsyncLocalStorage<AppDatabase>();

/** RSC fallback: one client per React request when ALS is not set (Workers only). */
const getDbForReactRequest = cache(() => createDb(5));

/** Prefer this in new code. ALS (route handlers) wins over react.cache (RSC). */
export function getDb(): AppDatabase {
  if (!isCloudflareWorkerRuntime()) {
    return getSingletonDb();
  }
  return requestDb.getStore() ?? getDbForReactRequest();
}

/**
 * Run work with a request-scoped DB (route handlers that touch DB many times).
 * Safe no-op nesting if already inside a scope.
 * On Vercel/Node this uses the process singleton (no per-call pools).
 */
export function withDb<T>(fn: () => T): T {
  if (!isCloudflareWorkerRuntime()) {
    return fn();
  }
  if (requestDb.getStore()) return fn();
  return requestDb.run(createDb(5), fn);
}

export async function withDbAsync<T>(fn: () => Promise<T>): Promise<T> {
  if (!isCloudflareWorkerRuntime()) {
    return fn();
  }
  if (requestDb.getStore()) return fn();
  return requestDb.run(createDb(5), fn);
}

/**
 * Backward-compatible default: property access uses getDb()
 * (singleton on Vercel, request-scoped on Workers).
 */
const db = new Proxy({} as AppDatabase, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance as object, prop, receiver);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(instance)
      : value;
  },
}) as AppDatabase;

export default db;
