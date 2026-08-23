/**
 * Standalone recovery (no Next/React db cache).
 * Marks unpaid Razorpay shop orders paid when Razorpay shows captured/paid.
 *
 * Usage:
 *   node --env-file=.env.local scripts/recover-unpaid-razorpay-standalone.mjs
 *   node --env-file=.env.local scripts/recover-unpaid-razorpay-standalone.mjs --order=p2va6llqmkm2mnqdnnhhgj0b
 */
import postgres from "postgres";

const orderFilter = process.argv
  .filter((a) => a.startsWith("--order="))
  .map((a) => a.slice("--order=".length).trim())
  .filter(Boolean);

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

async function razorpayGet(config, path) {
  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString(
    "base64",
  );
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
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

function paiseToRupees(paise) {
  const n = Number(paise);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

function amountMismatch(expectedRaw, actualRupees) {
  const expected = Number(expectedRaw);
  if (!Number.isFinite(expected)) return false;
  if (actualRupees == null) return true;
  return Math.abs(expected - actualRupees) > 0.01;
}

async function main() {
  const config = await getRazorpayConfig();

  const candidates =
    orderFilter.length > 0
      ? await sql`
          select id, amount, payment_status, payment_reference, payment_meta
          from orders
          where payment_status = 'unpaid'
            and id = any(${orderFilter})
        `
      : await sql`
          select id, amount, payment_status, payment_reference, payment_meta
          from orders
          where payment_status = 'unpaid'
            and created_at >= now() - interval '21 days'
            and (
              payment_provider = 'razorpay'
              or payment_method = 'razorpay'
              or payment_reference like 'order_%'
            )
            and (
              payment_reference is not null
              or coalesce(payment_meta->>'razorpayOrderId', '') <> ''
            )
          order by created_at desc
          limit 50
        `;

  const summary = {
    scanned: candidates.length,
    syncedPaid: [],
    stillUnpaid: [],
    heldMismatch: [],
    errors: [],
  };

  for (const order of candidates) {
    const meta = asRecord(order.payment_meta);
    const razorpayOrderId = String(
      meta.razorpayOrderId ?? order.payment_reference ?? "",
    ).trim();
    if (!razorpayOrderId.startsWith("order_")) {
      summary.stillUnpaid.push(order.id);
      continue;
    }

    try {
      const rzpOrder = await razorpayGet(
        config,
        `/orders/${encodeURIComponent(razorpayOrderId)}`,
      );
      const payments = await razorpayGet(
        config,
        `/orders/${encodeURIComponent(razorpayOrderId)}/payments`,
      );
      const items = Array.isArray(payments.items) ? payments.items : [];
      const preferred =
        items.find((p) => String(p.status).toLowerCase() === "captured") ||
        items.find((p) => String(p.status).toLowerCase() === "authorized") ||
        items[0] ||
        null;

      const orderStatus = String(rzpOrder.status ?? "").toLowerCase();
      const paymentStatus = String(preferred?.status ?? "").toLowerCase();
      const isPaid = orderStatus === "paid" || paymentStatus === "captured";

      if (!isPaid) {
        summary.stillUnpaid.push({
          id: order.id,
          razorpayOrderId,
          orderStatus,
          paymentStatus: paymentStatus || null,
        });
        continue;
      }

      const gatewayAmount = paiseToRupees(
        preferred?.amount ?? rzpOrder.amount,
      );
      if (amountMismatch(order.amount, gatewayAmount)) {
        const nextMeta = {
          ...meta,
          razorpayOrderId,
          razorpayPaymentId: preferred?.id ?? null,
          razorpayOrderStatus: orderStatus,
          razorpayPaymentStatus: paymentStatus || null,
          amountMismatch: {
            expected: Number(order.amount),
            gatewayReported: gatewayAmount,
            detectedAt: new Date().toISOString(),
          },
        };
        await sql`
          update orders
          set payment_meta = ${sql.json(nextMeta)}
          where id = ${order.id}
            and payment_status <> 'paid'
        `;
        summary.heldMismatch.push({
          id: order.id,
          expected: Number(order.amount),
          gateway: gatewayAmount,
        });
        continue;
      }

      const nextMeta = {
        ...meta,
        razorpayOrderId,
        razorpayPaymentId: preferred?.id ?? null,
        razorpayOrderStatus: orderStatus,
        razorpayPaymentStatus: paymentStatus || null,
        razorpayMethod: preferred?.method ?? null,
        recoveredAt: new Date().toISOString(),
        recoveredBy: "standalone-razorpay-recovery",
      };

      const updated = await sql`
        update orders
        set
          payment_status = 'paid',
          order_status = 'PREPARING',
          payment_method = 'razorpay',
          payment_provider = 'razorpay',
          payment_reference = ${razorpayOrderId},
          payment_meta = ${sql.json(nextMeta)}
        where id = ${order.id}
          and payment_status <> 'paid'
        returning id
      `;

      if (updated.length > 0) {
        summary.syncedPaid.push(order.id);
      } else {
        summary.stillUnpaid.push(order.id);
      }
    } catch (error) {
      summary.errors.push({
        id: order.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  await sql.end({ timeout: 5 });

  if (summary.errors.length > 0) process.exitCode = 2;
}

main().catch(async (error) => {
  console.error(error);
  try {
    await sql.end({ timeout: 2 });
  } catch {
    /* ignore */
  }
  process.exit(1);
});
