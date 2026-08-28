/**
 * Dry-run validation against live DB + Razorpay.
 *
 * Does NOT:
 *   - send WhatsApp/SMS
 *   - mark orders paid unless Razorpay already captured (opt-in --apply)
 *   - leave a live payment link behind (creates ₹1 then cancels)
 *
 * Usage:
 *   node --env-file=.env.local scripts/simulate-razorpay-recovery.mjs
 *   node --env-file=.env.local scripts/simulate-razorpay-recovery.mjs --apply
 */
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = postgres(databaseUrl, { prepare: false, max: 3 });

function asRecord(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (typeof value === "object") return value;
  return {};
}

async function getRazorpayConfig() {
  const rows = await sql`
    select value, is_enabled
    from api_settings
    where key = 'razorpay'
    limit 1
  `;
  const row = rows[0];
  if (!row || row.is_enabled === false) {
    throw new Error("Razorpay integration is not enabled");
  }
  const value = asRecord(row.value);
  const keyId = String(value.keyId ?? "").trim();
  const keySecret = String(value.keySecret ?? "").trim();
  if (!keyId || !keySecret) throw new Error("Razorpay keys missing");
  return { keyId, keySecret };
}

async function razorpayRequest(config, path, init = {}) {
  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString(
    "base64",
  );
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.error?.description || `Razorpay ${res.status} for ${path}`,
    );
  }
  return data;
}

function classifyGateway(orderStatus, payments) {
  const items = Array.isArray(payments) ? payments : [];
  const captured = items.find(
    (p) => String(p.status ?? "").toLowerCase() === "captured",
  );
  const authorized = items.find(
    (p) => String(p.status ?? "").toLowerCase() === "authorized",
  );
  const failed = items.find(
    (p) => String(p.status ?? "").toLowerCase() === "failed",
  );
  const status = String(orderStatus ?? "").toLowerCase();

  if (status === "paid" || captured) return "WOULD_MARK_PAID";
  if (authorized) return "AUTHORIZED_NOT_CAPTURED";
  if (failed || status === "attempted") return "FAILED_OR_ATTEMPTED";
  if (status === "created" || items.length === 0) return "ABANDONED";
  return `OTHER:${status || "unknown"}`;
}

async function simulateUnpaidSync(config) {
  const rows = await sql`
    select
      id,
      amount,
      payment_status,
      order_status,
      payment_reference,
      payment_meta
    from orders
    where payment_status = 'unpaid'
      and created_at >= now() - interval '14 days'
      and (
        payment_provider = 'razorpay'
        or payment_method = 'razorpay'
        or coalesce(payment_reference, '') like 'order_%'
      )
    order by created_at desc
    limit 40
  `;

  const summary = {
    scanned: 0,
    wouldMarkPaid: [],
    abandoned: 0,
    failed: 0,
    authorized: 0,
    errors: [],
  };

  for (const row of rows) {
    const meta = asRecord(row.payment_meta);
    const razorpayOrderId = String(
      meta.razorpayOrderId ?? row.payment_reference ?? "",
    ).trim();
    if (!razorpayOrderId.startsWith("order_")) continue;

    summary.scanned += 1;
    try {
      const rzpOrder = await razorpayRequest(
        config,
        `/orders/${encodeURIComponent(razorpayOrderId)}`,
      );
      const paymentsPayload = await razorpayRequest(
        config,
        `/orders/${encodeURIComponent(razorpayOrderId)}/payments`,
      );
      const verdict = classifyGateway(rzpOrder.status, paymentsPayload.items);
      if (verdict === "WOULD_MARK_PAID") {
        summary.wouldMarkPaid.push({
          orderId: row.id,
          razorpayOrderId,
          amount: row.amount,
          shopStatus: row.order_status,
        });
      } else if (verdict === "ABANDONED") {
        summary.abandoned += 1;
      } else if (verdict === "FAILED_OR_ATTEMPTED") {
        summary.failed += 1;
      } else if (verdict === "AUTHORIZED_NOT_CAPTURED") {
        summary.authorized += 1;
      }
    } catch (error) {
      summary.errors.push({
        orderId: row.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}

async function simulateAbandonedCandidates() {
  const rows = await sql`
    select
      id,
      amount,
      created_at,
      order_status,
      coalesce((payment_meta->>'recoveryLinkSent')::boolean, false) as recovery_sent
    from orders
    where payment_status = 'unpaid'
      and order_status = 'pending'
      and created_at < now() - interval '20 minutes'
      and created_at >= now() - interval '24 hours'
      and coalesce(customer_mobile, '') <> ''
      and coalesce((payment_meta->>'recoveryLinkSent')::boolean, false) = false
    order by created_at desc
    limit 20
  `;
  return rows.map((row) => ({
    orderId: row.id,
    amount: row.amount,
    createdAt: row.created_at,
  }));
}

async function simulatePaymentLinkApi(config) {
  const created = await razorpayRequest(config, "/payment_links", {
    method: "POST",
    body: JSON.stringify({
      amount: 100,
      currency: "INR",
      accept_partial: false,
      reference_id: `sim_${Date.now()}`.slice(0, 40),
      description: "THRY validation — cancel immediately",
      expire_by: Math.floor(Date.now() / 1000) + 20 * 60,
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { source: "thry_simulation" },
    }),
  });

  const linkId = String(created.id ?? "").trim();
  const shortUrl = String(created.short_url ?? "").trim();
  if (!linkId || !shortUrl) {
    throw new Error("Payment link API did not return id/short_url");
  }

  await razorpayRequest(config, `/payment_links/${encodeURIComponent(linkId)}/cancel`, {
    method: "POST",
  });

  return { linkId, shortUrl, cancelled: true };
}

async function applyPaidRecoveries(config, paidRows) {
  const applied = [];
  for (const row of paidRows) {
    const rzpOrder = await razorpayRequest(
      config,
      `/orders/${encodeURIComponent(row.razorpayOrderId)}`,
    );
    const paymentsPayload = await razorpayRequest(
      config,
      `/orders/${encodeURIComponent(row.razorpayOrderId)}/payments`,
    );
    const captured = (paymentsPayload.items ?? []).find(
      (p) => String(p.status ?? "").toLowerCase() === "captured",
    );
    const paymentId = String(captured?.id ?? "").trim() || null;

    await sql`
      update orders
      set
        payment_status = 'paid',
        order_status = 'PREPARING',
        payment_meta = coalesce(payment_meta, '{}'::jsonb) || ${sql.json({
          razorpayOrderId: row.razorpayOrderId,
          razorpayPaymentId: paymentId,
          razorpayOrderStatus: rzpOrder.status ?? "paid",
          recoveredBy: "simulate-razorpay-recovery",
        })}
      where id = ${row.orderId}
        and payment_status <> 'paid'
    `;
    applied.push(row.orderId);
  }
  return applied;
}

async function main() {
  const config = await getRazorpayConfig();
  console.log("Razorpay key mode:", config.keyId.startsWith("rzp_live_") ? "live" : "test");

  const unpaid = await simulateUnpaidSync(config);
  console.log("\n=== Unpaid Razorpay sync (dry-run) ===");
  console.log(JSON.stringify(unpaid, null, 2));

  const abandoned = await simulateAbandonedCandidates();
  console.log("\n=== Abandoned-cart candidates (would WhatsApp, not sent) ===");
  console.log(JSON.stringify({ count: abandoned.length, orders: abandoned }, null, 2));

  console.log("\n=== Payment Links API (create ₹1 + cancel) ===");
  const link = await simulatePaymentLinkApi(config);
  console.log(JSON.stringify(link, null, 2));

  if (APPLY && unpaid.wouldMarkPaid.length > 0) {
    const applied = await applyPaidRecoveries(config, unpaid.wouldMarkPaid);
    console.log("\n=== Applied paid recoveries ===");
    console.log(applied);
  } else if (unpaid.wouldMarkPaid.length > 0) {
    console.log(
      "\nCaptured payments exist. Re-run with --apply to mark them paid on THRY.",
    );
  } else {
    console.log("\nNo captured-but-unpaid orders. Recovery cron would be a no-op.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
