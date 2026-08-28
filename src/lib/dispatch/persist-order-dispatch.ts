import {
  DISPATCH_GUARD_MISMATCH_MESSAGE,
} from "@/lib/dispatch/dispatch-errors";
import { withRetry } from "@/lib/resilience";
import db from "@/lib/supabase/db";
import {
  dispatchCouriers,
  orderDispatchEvents,
  orders,
  profiles,
} from "@/lib/supabase/schema";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, sql } from "drizzle-orm";

export async function resolveDispatchCreatedBy(
  userId: string,
): Promise<string | null> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId),
    columns: { id: true },
  });
  return profile?.id ?? null;
}

export type PersistOrderDispatchInput = {
  orderId: string;
  courier: Pick<
    typeof dispatchCouriers.$inferSelect,
    "id" | "name" | "trackingUrlTemplate"
  >;
  trackingNumber: string | null;
  createdBy: string | null;
  dispatchedAtIso?: string;
};

export type PersistOrderDispatchResult = {
  dispatchEventId: string;
  dispatchedAtIso: string;
};

export async function persistOrderDispatch(
  input: PersistOrderDispatchInput,
): Promise<PersistOrderDispatchResult> {
  const dispatchedAtIso = input.dispatchedAtIso ?? new Date().toISOString();
  let dispatchEventId = "";

  await withRetry(
    async () => {
      dispatchEventId = "";
      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(orders)
          .set({ order_status: "DISPATCHED" })
          .where(
            and(
              eq(orders.id, input.orderId),
              sql`lower(trim(${orders.order_status})) = 'preparing'`,
              sql`lower(trim(${orders.payment_status})) in ('paid','success','captured')`,
            ),
          )
          .returning({ id: orders.id });

        if (!updated) {
          throw new Error(DISPATCH_GUARD_MISMATCH_MESSAGE);
        }

        const eventId = createId();
        dispatchEventId = eventId;

        await tx.insert(orderDispatchEvents).values({
          id: eventId,
          orderId: input.orderId,
          courierId: input.courier.id,
          courierName: input.courier.name,
          trackingUrlTemplate: input.courier.trackingUrlTemplate,
          trackingNumber: input.trackingNumber,
          dispatchStatus: "DISPATCHED",
          dispatchedAt: dispatchedAtIso,
          createdBy: input.createdBy,
        });
      });
    },
    { label: "dispatch:persist", attempts: 3 },
  );

  if (!dispatchEventId) {
    throw new Error("Dispatch failed. Please retry.");
  }

  return { dispatchEventId, dispatchedAtIso };
}
