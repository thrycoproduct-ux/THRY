import postgres from "postgres";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: join(root, ".env.local") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DATABASE_URL in .env.local");
  process.exit(1);
}

const migrationSql = readFileSync(
  join(root, "supabase", "15-dispatch-tables-rls.sql"),
  "utf8",
);

const tables = ["dispatch_couriers", "order_dispatch_events"];
const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql.unsafe(migrationSql);

  for (const table of tables) {
    const policies = await sql`
      select policyname from pg_policies
      where schemaname = 'public' and tablename = ${table}
    `;
    if (policies.length > 0) {
      throw new Error(
        `Expected zero policies on ${table}, found: ${policies
          .map((p) => p.policyname)
          .join(", ")}`,
      );
    }

    const grants = await sql`
      select grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = ${table}
        and grantee in ('anon', 'authenticated')
    `;
    if (grants.length > 0) {
      throw new Error(
        `Expected no anon/authenticated grants on ${table}, found: ${grants
          .map((g) => `${g.grantee}:${g.privilege_type}`)
          .join(", ")}`,
      );
    }

    const rls = await sql`
      select relrowsecurity from pg_class
      where oid = ${`public.${table}`}::regclass
    `;
    if (rls[0]?.relrowsecurity !== true) {
      throw new Error(`RLS is not enabled on ${table}`);
    }
  }

  const rowCounts = await sql`
    select
      (select count(*)::int from dispatch_couriers) as couriers,
      (select count(*)::int from order_dispatch_events) as dispatch_events
  `;

  console.log(
    "OK: dispatch tables locked down (RLS on, no policies, no anon/authenticated grants)",
  );
  console.log("Row counts unchanged:", rowCounts[0]);
} catch (e) {
  console.error("Migration failed:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
