/**
 * Dry-run dispatch via Drizzle transaction (rolls back).
 * Usage: npx tsx --env-file=.env.local scripts/test-dispatch-transaction.ts
 */
import db from "../src/lib/supabase/db";
import {
  dispatchCouriers,
  orderDispatchEvents,
  orders,
} from "../src/lib/supabase/schema";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, sql } from "drizzle-orm";

async function main() {
  const orderId = process.argv[2] ?? "x0i0thr1n1z7cpzo8bazhfzv";
  const courierId = process.argv[3] ?? "stcourier";
  const trackingNumber = process.argv[4] ?? "64427263552";
  const createdBy = process.argv[5] ?? "fd8a739c-6b36-4b06-a85f-6d4afb5f0760";

  const courier = await db.query.dispatchCouriers.findFirst({
    where: eq(dispatchCouriers.id, courierId),
  });
  if (!courier) {
    console.error("courier not found");
    process.exit(1);
  }

  try {
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(orders)
        .set({ order_status: "DISPATCHED" })
        .where(
          and(
            eq(orders.id, orderId),
            sql`lower(trim(${orders.order_status})) = 'preparing'`,
            sql`lower(trim(${orders.payment_status})) in ('paid','success','captured')`,
          ),
        )
        .returning({ id: orders.id });

      console.log("updated:", updated);

      if (!updated) throw new Error("guard mismatch");

      await tx.insert(orderDispatchEvents).values({
        id: createId(),
        orderId,
        courierId: courier.id,
        courierName: courier.name,
        trackingUrlTemplate: courier.trackingUrlTemplate,
        trackingNumber,
        dispatchStatus: "DISPATCHED",
        dispatchedAt: new Date().toISOString(),
        createdBy,
      });

      throw new Error("ROLLBACK_TEST");
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ROLLBACK_TEST") {
      console.log("SUCCESS: drizzle transaction path works (rolled back)");
    } else {
      console.error("FAILED:", error);
      process.exitCode = 1;
    }
  }

  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
