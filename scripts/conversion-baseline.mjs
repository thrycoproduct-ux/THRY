/**
 * Conversion baseline (WHERE in the funnel after order create).
 * Run: node scripts/conversion-baseline.mjs  (needs DATABASE_URL)
 *
 * Snapshot 2026-08-30 (plan start):
 *   orders_7d=67, paid_7d=24, paid_pct=35.8%
 *   unpaid telemetry mix (lastEvent): none=46, razorpay_webhook_failed=10,
 *   payment_confirmed=6, razorpay_modal_opened=3, payment_cancelled=2
 */
import postgres from "postgres";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv() {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}
loadEnv();

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const [summary] = await sql`
  select
    count(*)::int as orders_7d,
    count(*) filter (where lower(coalesce(payment_status,'')) = 'paid')::int as paid_7d,
    count(*) filter (where lower(coalesce(payment_status,'')) <> 'paid')::int as unpaid_7d,
    round(
      100.0 * count(*) filter (where lower(coalesce(payment_status,'')) = 'paid')
        / nullif(count(*), 0),
      1
    ) as paid_pct
  from orders
  where created_at > now() - interval '7 days'
`;
const mix = await sql`
  select
    coalesce(payment_meta->'checkoutTelemetry'->>'lastEvent', 'none') as last_event,
    count(*)::int as n
  from orders
  where created_at > now() - interval '7 days'
  group by 1
  order by n desc
  limit 25
`;
await sql.end({ timeout: 3 });

console.log("=== conversion baseline (7d, post order-create) ===");
console.log(summary);
console.log("=== unpaid/paid lastEvent mix ===");
console.log(mix);
console.log(
  "Target: raise paid_pct above baseline 35.8% after payment-abandon fixes.",
);
