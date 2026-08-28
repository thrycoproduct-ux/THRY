import { DISPATCH_GUARD_MISMATCH_MESSAGE } from "@/lib/dispatch/dispatch-errors";
import { withRetry } from "@/lib/resilience";
import db from "@/lib/supabase/db";
import { dispatchCouriers, profiles } from "@/lib/supabase/schema";
import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";

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

type DispatchPersistRow = {
  id: string;
  dispatched_at: string;
};

/**
 * Atomically mark the order DISPATCHED and insert the dispatch event in one
 * SQL statement. Avoids postgres.js `begin()` races that surface as
 * "Cannot set properties of undefined (setting 'onclose')" under pool pressure.
 */
export async function persistOrderDispatch(
  input: PersistOrderDispatchInput,
): Promise<PersistOrderDispatchResult> {
  const dispatchedAtIso = input.dispatchedAtIso ?? new Date().toISOString();

  const rows = await withRetry(
    async () => {
      const eventId = createId();
      return (await db.execute(sql`
        WITH updated AS (
          UPDATE orders
          SET order_status = 'DISPATCHED'
          WHERE id = ${input.orderId}
            AND lower(trim(order_status)) = 'preparing'
            AND lower(trim(payment_status)) IN ('paid', 'success', 'captured')
          RETURNING id
        )
        INSERT INTO order_dispatch_events (
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
        SELECT
          ${eventId},
          ${input.orderId},
          ${input.courier.id},
          ${input.courier.name},
          ${input.courier.trackingUrlTemplate},
          ${input.trackingNumber},
          'DISPATCHED',
          ${dispatchedAtIso}::timestamptz,
          ${input.createdBy}
        FROM updated
        RETURNING id, dispatched_at
      `)) as DispatchPersistRow[];
    },
    { label: "dispatch:persist", attempts: 3 },
  );

  const inserted = rows?.[0];
  if (!inserted?.id) {
    throw new Error(DISPATCH_GUARD_MISMATCH_MESSAGE);
  }

  return {
    dispatchEventId: inserted.id,
    dispatchedAtIso: inserted.dispatched_at ?? dispatchedAtIso,
  };
}
