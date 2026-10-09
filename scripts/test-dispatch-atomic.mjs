/**
 * Simulate production dispatch persist (atomic CTE, no sql.begin).
 * Commits briefly, verifies row state, then reverts so prod order stays PREPARING.
 *
 * Usage: node --env-file=.env.local scripts/test-dispatch-atomic.mjs
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
const createdBy = process.argv[5] ?? null;

const sql = postgres((process.env.DATABASE_URL ?? "").trim(), poolerOptions);

function log(label, rows) {
  console.log(`\n${label}:`);
  console.log(JSON.stringify(rows, null, 2));
}

try {
  const [before] = await sql`
    select
      o.id,
      o.order_status,
      o.payment_status,
      e.id as dispatch_event_id,
      e.courier_name,
      e.tracking_number
    from orders o
    left join order_dispatch_events e on e.order_id = o.id
    where o.id = ${orderId}
  `;
  log("BEFORE", before);

  const [courier] = await sql`
    select id, name, tracking_url_template
    from dispatch_couriers
    where id = ${courierId} and is_active = true
  `;
  if (!courier) throw new Error(`Courier not found or inactive: ${courierId}`);

  const eventId = `sim-${Date.now()}`;
  const dispatchedAt = new Date().toISOString();

  const inserted = await sql`
    with updated as (
      update orders
      set order_status = 'DISPATCHED'
      where id = ${orderId}
        and lower(trim(order_status)) = 'preparing'
        and lower(trim(payment_status)) in ('paid', 'success', 'captured')
      returning id
    )
    insert into order_dispatch_events (
      id,
      order_id,
      courier_id,
      courier_name,
      tracking_url_template,
      tracking_number,
      dispatch_status,
      dispatched_at,
      created_by
    )
    select
      ${eventId},
      ${orderId},
      ${courier.id},
      ${courier.name},
      ${courier.tracking_url_template},
      ${trackingNumber},
      'DISPATCHED',
      ${dispatchedAt}::timestamptz,
      ${createdBy}
    from updated
    returning id, dispatched_at
  `;

  if (!inserted.length) {
    throw new Error(
      "Atomic dispatch returned no rows (guard mismatch or order not dispatchable).",
    );
  }

  log("ATOMIC INSERT OK", inserted[0]);

  const [afterDispatch] = await sql`
    select
      o.id,
      o.order_status,
      o.payment_status,
      e.id as dispatch_event_id,
      e.courier_name,
      e.tracking_number,
      e.dispatched_at
    from orders o
    left join order_dispatch_events e on e.order_id = o.id
    where o.id = ${orderId}
  `;
  log("AFTER DISPATCH (committed briefly)", afterDispatch);

  if (afterDispatch.order_status !== "DISPATCHED") {
    throw new Error("Expected order_status DISPATCHED after atomic persist.");
  }
  if (afterDispatch.dispatch_event_id !== eventId) {
    throw new Error("Expected dispatch event row to match simulation insert.");
  }

  await sql`delete from order_dispatch_events where id = ${eventId}`;
  await sql`
    update orders
    set order_status = 'PREPARING'
    where id = ${orderId}
  `;

  const [afterRevert] = await sql`
    select
      o.id,
      o.order_status,
      o.payment_status,
      e.id as dispatch_event_id
    from orders o
    left join order_dispatch_events e on e.order_id = o.id
    where o.id = ${orderId}
  `;
  log("AFTER REVERT", afterRevert);

  if (afterRevert.order_status !== before.order_status) {
    throw new Error("Revert failed: order_status changed permanently.");
  }
  if (afterRevert.dispatch_event_id !== before.dispatch_event_id) {
    throw new Error("Revert failed: dispatch event still present.");
  }

  console.log("\nSUCCESS: production atomic dispatch path verified (no onclose error).");
  console.log("Order left unchanged in PREPARING — safe to dispatch from admin UI.");
} catch (error) {
  console.error("\nFAILED:", error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
