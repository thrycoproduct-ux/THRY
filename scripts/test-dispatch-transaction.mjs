/**
 * Dry-run dispatch transaction against live DB (rolls back).
 * Usage: node --env-file=.env.local scripts/test-dispatch-transaction.mjs
 */
import postgres from "postgres";

const poolerOptions = {
  prepare: false,
  max: 1,
  max_pipeline: 0,
  idle_timeout: 20,
  connect_timeout: 8,
  max_lifetime: 60 * 30,
  connection: { statement_timeout: 8000 },
};

const orderId = process.argv[2] ?? "x0i0thr1n1z7cpzo8bazhfzv";
const courierId = process.argv[3] ?? "stcourier";
const trackingNumber = process.argv[4] ?? "64427263552";
const createdBy = process.argv[5] ?? "fd8a739c-6b36-4b06-a85f-6d4afb5f0760";

const sql = postgres((process.env.DATABASE_URL ?? "").trim(), poolerOptions);

try {
  await sql.begin(async (tx) => {
    const updated = await tx`
      update orders
      set order_status = 'DISPATCHED'
      where id = ${orderId}
        and lower(trim(order_status)) = 'preparing'
        and lower(trim(payment_status)) in ('paid','success','captured')
      returning id
    `;
    console.log("updated rows:", updated.length, updated);

    if (updated.length === 0) {
      throw new Error("guard mismatch");
    }

    const eventId = `test-${Date.now()}`;
    await tx`
      insert into order_dispatch_events (
        id, order_id, courier_id, courier_name, tracking_url_template,
        tracking_number, dispatch_status, dispatched_at, created_by
      ) values (
        ${eventId},
        ${orderId},
        ${courierId},
        ${"ST courier"},
        ${"https://stcourier.com/track/shipment"},
        ${trackingNumber},
        ${"DISPATCHED"},
        ${new Date().toISOString()},
        ${createdBy}
      )
    `;
    console.log("insert ok", eventId);

    throw new Error("ROLLBACK_TEST");
  });
} catch (error) {
  if (error instanceof Error && error.message === "ROLLBACK_TEST") {
    console.log("SUCCESS: transaction path works (rolled back)");
  } else {
    console.error("FAILED:", error);
    process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}
