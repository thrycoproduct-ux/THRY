import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  like,
  ne,
  or,
  sql,
} from "drizzle-orm";
import db from "@/lib/supabase/db";
import { orders } from "@/lib/supabase/schema";
import { syncRazorpayOrderPayment } from "@/lib/payments/orderPaymentSync";
import { readPaymentMeta } from "@/lib/orders/payment-meta";

export type RecoverUnpaidRazorpayResult = {
  scanned: number;
  syncedPaid: number;
  stillUnpaid: number;
  errors: Array<{ orderId: string; message: string }>;
  paidOrderIds: string[];
};

/**
 * Poll Razorpay for recent unpaid shop orders that already have a Razorpay
 * order id. Marks paid when Razorpay shows order paid / payment captured.
 *
 * Safety net when customer paid via UPI and closed the browser, or webhook
 * delivery/signature failed.
 */
export async function recoverUnpaidRazorpayOrders(options?: {
  lookbackDays?: number;
  limit?: number;
  orderIds?: string[];
}): Promise<RecoverUnpaidRazorpayResult> {
  const lookbackDays = Math.max(1, Math.min(options?.lookbackDays ?? 14, 60));
  const limit = Math.max(1, Math.min(options?.limit ?? 40, 100));
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const specificIds = (options?.orderIds ?? [])
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);

  const candidates =
    specificIds.length > 0
      ? await db.query.orders.findMany({
          where: and(
            eq(orders.payment_status, "unpaid"),
            inArray(orders.id, specificIds),
          ),
          orderBy: [desc(orders.createdAt)],
          limit,
        })
      : await db.query.orders.findMany({
          where: and(
            eq(orders.payment_status, "unpaid"),
            gte(orders.createdAt, since),
            or(
              eq(orders.payment_provider, "razorpay"),
              eq(orders.payment_method, "razorpay"),
              like(orders.payment_reference, "order_%"),
            ),
            or(
              isNotNull(orders.payment_reference),
              sql`coalesce((${orders.payment_meta}->>'razorpayOrderId'), '') <> ''`,
            ),
          ),
          orderBy: [desc(orders.createdAt)],
          limit,
        });

  const result: RecoverUnpaidRazorpayResult = {
    scanned: candidates.length,
    syncedPaid: 0,
    stillUnpaid: 0,
    errors: [],
    paidOrderIds: [],
  };

  for (const order of candidates) {
    const meta = readPaymentMeta(order.payment_meta);
    const razorpayOrderId = String(
      meta.razorpayOrderId ?? order.payment_reference ?? "",
    ).trim();

    if (!razorpayOrderId.startsWith("order_")) {
      result.stillUnpaid += 1;
      continue;
    }

    try {
      const sync = await syncRazorpayOrderPayment({
        orderId: order.id,
        razorpayOrderId,
        razorpayPaymentId: String(meta.razorpayPaymentId ?? "").trim() || null,
      });

      if (sync.isPaid) {
        result.syncedPaid += 1;
        result.paidOrderIds.push(order.id);
      } else {
        result.stillUnpaid += 1;
      }
    } catch (error) {
      result.stillUnpaid += 1;
      result.errors.push({
        orderId: order.id,
        message:
          error instanceof Error
            ? error.message
            : "Razorpay recovery sync failed",
      });
    }
  }

  return result;
}

/**
 * Re-run idempotent paid side effects for recent Razorpay-paid orders that
 * were recovered manually or where webhook never completed email/inventory.
 */
export async function repairPaidRazorpaySideEffects(options?: {
  lookbackDays?: number;
  limit?: number;
}): Promise<{ scanned: number; repaired: number; errors: string[] }> {
  const lookbackDays = Math.max(1, Math.min(options?.lookbackDays ?? 14, 60));
  const limit = Math.max(1, Math.min(options?.limit ?? 30, 100));
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const candidates = await db.query.orders.findMany({
    where: and(
      eq(orders.payment_status, "paid"),
      gte(orders.createdAt, since),
      or(
        eq(orders.payment_provider, "razorpay"),
        eq(orders.payment_method, "razorpay"),
        like(orders.payment_reference, "order_%"),
      ),
      sql`coalesce((${orders.payment_meta}->>'emailNotified')::text, 'false') <> 'true'`,
    ),
    orderBy: [desc(orders.createdAt)],
    limit,
  });

  let repaired = 0;
  const errors: string[] = [];

  for (const order of candidates) {
    const meta = readPaymentMeta(order.payment_meta);
    const razorpayOrderId = String(
      meta.razorpayOrderId ?? order.payment_reference ?? "",
    ).trim();
    if (!razorpayOrderId.startsWith("order_")) continue;
    try {
      await syncRazorpayOrderPayment(
        {
          orderId: order.id,
          razorpayOrderId,
          razorpayPaymentId:
            String(meta.razorpayPaymentId ?? "").trim() || null,
        },
        { runSideEffects: true },
      );
      repaired += 1;
    } catch (error) {
      errors.push(
        `${order.id}: ${
          error instanceof Error ? error.message : "side-effect repair failed"
        }`,
      );
    }
  }

  return { scanned: candidates.length, repaired, errors };
}

/** Single-order admin/manual recovery. */
export async function recoverSingleRazorpayOrder(orderId: string) {
  const unpaid = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), ne(orders.payment_status, "paid")),
  });

  const order =
    unpaid ??
    (await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    }));

  if (!order) throw new Error("Order not found");

  const meta = readPaymentMeta(order.payment_meta);
  const razorpayOrderId = String(
    meta.razorpayOrderId ?? order.payment_reference ?? "",
  ).trim();
  if (!razorpayOrderId.startsWith("order_")) {
    throw new Error("Order has no Razorpay order id to sync.");
  }

  return syncRazorpayOrderPayment(
    {
      orderId: order.id,
      razorpayOrderId,
      razorpayPaymentId: String(meta.razorpayPaymentId ?? "").trim() || null,
    },
    { runSideEffects: true },
  );
}
