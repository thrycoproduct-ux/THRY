/**
 * Conversion baseline (WHERE after order create) + Razorpay stage mix.
 * Run: node scripts/conversion-baseline.mjs  (needs DATABASE_URL)
 *
 * Snapshot 2026-08-30 (plan start):
 *   orders_7d=67, paid_7d=24, paid_pct=35.8%
 *   unpaid telemetry mix (lastEvent): none=46, razorpay_webhook_failed=10,
 *   payment_confirmed=6, razorpay_modal_opened=3, payment_cancelled=2
 *
 * --- Clarity + Razorpay ops checklist (weekly) ---
 * Clarity cannot film inside Razorpay iframe or GPay. Use stage events:
 *   1. Clarity → Recordings → custom event checkout_click, Device=Mobile, 7d
 *   2. Bucket 10–15 sessions: no payment_open / open then cancel / long
 *      rzp_modal_dwell_ms + cancel / payment_paid
 *   3. Filter Instagram/Facebook WebView separately (UPI Intent pain)
 *   4. Razorpay Dashboard → Payments/Orders same window: created vs paid vs
 *      failed; method=UPI share. Proxy for GPay abandon:
 *      payment_open → long dwell → payment_cancel / unpaid
 *   5. Vercel logs: grep "[checkout-funnel]" for rzp_open_timeout /
 *      rzp_script_fail / payment_failed
 *   6. Fix only the top bucket; re-run this script after 48h–7d
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
/** Stage-ish lastEvents after razorpay sub-stage instrumentation. */
const stageMix = await sql`
  select
    coalesce(payment_meta->'checkoutTelemetry'->>'lastEvent', 'none') as last_event,
    count(*)::int as n
  from orders
  where created_at > now() - interval '7 days'
    and coalesce(payment_meta->'checkoutTelemetry'->>'lastEvent', 'none') in (
      'razorpay_modal_opened',
      'payment_cancelled',
      'payment_failed',
      'razorpay_script_failed',
      'razorpay_open_timeout',
      'payment_confirmed',
      'razorpay_webhook_failed',
      'checkout_session_failed',
      'verify_failed',
      'verify_held'
    )
  group by 1
  order by n desc
`;
await sql.end({ timeout: 3 });

console.log("=== conversion baseline (7d, post order-create) ===");
console.log(summary);
console.log("=== unpaid/paid lastEvent mix ===");
console.log(mix);
console.log("=== razorpay stage lastEvent mix ===");
console.log(stageMix);
console.log(
  "Target: raise paid_pct above baseline 35.8%; name top drop (cancel vs open_timeout vs script_fail).",
);
