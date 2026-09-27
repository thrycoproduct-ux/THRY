import db from "@/lib/supabase/db";
import { orders } from "@/lib/supabase/schema";
import {
  formatInternalOrderRef,
  internalOrderRefPrefixFromDate,
} from "@/lib/orders/internal-order-ref";
import { eq, sql } from "drizzle-orm";

type CounterRow = { last_seq: number };

/**
 * Idempotently assign `orders.internal_ref` when an order becomes paid.
 * Concurrent-safe via per-month counter upsert + unique index on internal_ref.
 *
 * Returns the existing or newly assigned ref (null only if order missing / not paid).
 */
export async function assignInternalOrderRefIfNeeded(
  orderId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const existing = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { id: true, internal_ref: true, payment_status: true },
  });

  if (!existing) return null;
  if (existing.internal_ref) return existing.internal_ref;

  const status = String(existing.payment_status ?? "")
    .trim()
    .toLowerCase();
  if (
    status !== "paid" &&
    status !== "success" &&
    status !== "captured" &&
    status !== "no_payment_required"
  ) {
    return null;
  }

  const { yymm } = internalOrderRefPrefixFromDate(now);

  const counterRows = (await db.execute(sql`
    insert into order_internal_ref_counters (yymm, last_seq, updated_at)
    values (${yymm}, 1, now())
    on conflict (yymm) do update
      set last_seq = order_internal_ref_counters.last_seq + 1,
          updated_at = now()
    returning last_seq
  `)) as unknown as CounterRow[];

  const lastSeq = Number(counterRows?.[0]?.last_seq);
  if (!Number.isInteger(lastSeq) || lastSeq < 1) {
    throw new Error(
      `[internal-ref] counter returned invalid seq for ${yymm}: ${String(lastSeq)}`,
    );
  }

  const candidate = formatInternalOrderRef(yymm, lastSeq);

  const updated = await db
    .update(orders)
    .set({ internal_ref: candidate })
    .where(sql`${orders.id} = ${orderId} and ${orders.internal_ref} is null`)
    .returning({ internal_ref: orders.internal_ref });

  if (updated[0]?.internal_ref) {
    return updated[0].internal_ref;
  }

  const again = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { internal_ref: true },
  });
  return again?.internal_ref ?? null;
}
