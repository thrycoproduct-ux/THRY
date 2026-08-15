import db from "@/lib/supabase/db";
import { carts, orders, type SelectOrders } from "@/lib/supabase/schema";
import { notifyVeloOrderPushSafe } from "@/lib/integrations/velo-order-push";
import {
  notifyOrderWhatsAppTargets,
  sendSellerOpsAlert,
} from "@/lib/integrations/whatsapp";
import { fetchPhonePePaymentStatus } from "@/lib/payments/phonepe";
import { fetchCashfreeOrderStatus } from "@/lib/payments/cashfree";
import {
  fetchRazorpayOrder,
  fetchRazorpayPayment,
} from "@/lib/payments/razorpay";
import { paiseToRupees } from "@/lib/payments/razorpay-standards";
import { fulfillPaidOrderInventory } from "@/lib/orders/inventory-fulfillment";
import { mergePaymentMeta, readPaymentMeta } from "@/lib/orders/payment-meta";
import { detectPaidAmountMismatch } from "@/lib/payments/amount-check";
import {
  canReleaseOrphanUnpaidHold,
  isReservationExpired,
  releaseStockReservation,
  hasActiveStockReservation,
} from "@/lib/orders/stock-reservation";
import { and, eq, ne } from "drizzle-orm";

type SyncInput =
  | { orderId: string; merchantTransactionId?: string | null }
  | { orderId?: string | null; merchantTransactionId: string };

/**
 * All post-payment side effects, each individually idempotent (guarded by
 * flags on the order row / payment_meta):
 * - WhatsApp confirmations  -> whatsapp_notified / whatsapp_seller_notified
 * - Cart clear              -> plain DELETE, naturally idempotent
 * - Inventory fulfillment   -> payment_meta.inventoryFulfilled
 * - Velo push               -> payment_meta.veloPushNotified
 *
 * Every effect is attempted even if an earlier one fails; if anything failed
 * we throw at the end so the webhook returns 5xx and the gateway retries.
 * Because each effect is idempotent, the retry safely completes only the
 * missing work instead of duplicating what already succeeded.
 */
async function runPaidOrderSideEffects(order: SelectOrders) {
  const failures: string[] = [];

  try {
    const wa = await notifyOrderWhatsAppTargets(order);
    if (wa.customerNotified || wa.sellerNotified) {
      await db
        .update(orders)
        .set({
          whatsapp_notified: wa.customerNotified
            ? true
            : order.whatsapp_notified,
          whatsapp_notified_at: wa.customerNotified
            ? new Date().toISOString()
            : order.whatsapp_notified_at,
          whatsapp_seller_notified: wa.sellerNotified
            ? true
            : order.whatsapp_seller_notified,
          whatsapp_seller_notified_at: wa.sellerNotified
            ? new Date().toISOString()
            : order.whatsapp_seller_notified_at,
        })
        .where(eq(orders.id, order.id));
    }
  } catch (error) {
    console.error("[payments] WhatsApp notify failed:", error);
    failures.push("whatsapp");
  }

  try {
    if (order.user_id) {
      await db.delete(carts).where(eq(carts.userId, order.user_id));
    }
  } catch (error) {
    console.error("[payments] cart clear failed:", error);
    failures.push("cart_clear");
  }

  try {
    await fulfillPaidOrderInventory(order.id);
  } catch (error) {
    console.error("[payments] inventory fulfillment failed:", error);
    failures.push("inventory");
  }

  try {
    await notifyVeloOrderPushSafe(order);
  } catch (error) {
    console.error("[payments] Velo push failed:", error);
    failures.push("velo");
  }

  if (failures.length > 0) {
    throw new Error(
      `Paid order side effects incomplete for ${order.id}: ${failures.join(", ")}`,
    );
  }
}

/**
 * For an order that was already paid when the sync started: re-run the
 * idempotent side effects so a previous attempt that crashed midway (e.g.
 * Worker eviction after the paid flip) is completed by the gateway retry.
 * When everything already ran, the flag guards make this a cheap no-op.
 */
async function ensurePaidOrderSideEffects(order: SelectOrders) {
  await runPaidOrderSideEffects(order);
}

async function maybeReleaseUnpaidReservation(orderId: string, reason: string) {
  await releaseStockReservation(orderId, reason, {
    allowOrphanFallback: true,
  }).catch((error) => {
    console.warn("[payments] stock release skipped:", error);
  });
}

async function maybeReleaseExpiredReservation(orderId: string) {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });
  if (!order || order.payment_status === "paid") return;

  const meta = readPaymentMeta(order.payment_meta);
  const shouldReleaseTracked =
    hasActiveStockReservation(meta) && isReservationExpired(meta);
  const shouldReleaseOrphan = canReleaseOrphanUnpaidHold(
    meta,
    order.createdAt,
    "reservation_expired",
  );

  if (shouldReleaseTracked || shouldReleaseOrphan) {
    await maybeReleaseUnpaidReservation(orderId, "reservation_expired");
  }
}

export async function syncPhonePeOrderPayment(input: SyncInput) {
  const currentOrder = input.orderId
    ? await db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      })
    : await db.query.orders.findFirst({
        where: eq(
          orders.phonepe_merchant_transaction_id,
          input.merchantTransactionId,
        ),
      });

  if (!currentOrder) {
    throw new Error("Order not found for payment sync");
  }

  const merchantTransactionId =
    currentOrder.phonepe_merchant_transaction_id ??
    input.merchantTransactionId ??
    "";

  if (!merchantTransactionId) {
    throw new Error("merchantTransactionId missing for PhonePe status sync");
  }

  // Already paid for this merchant txn — complete any side effects a prior
  // attempt missed (idempotent no-op when everything already ran).
  if (
    currentOrder.payment_status === "paid" &&
    (currentOrder.phonepe_merchant_transaction_id === merchantTransactionId ||
      currentOrder.payment_reference === merchantTransactionId ||
      currentOrder.phonepe_transaction_id)
  ) {
    await ensurePaidOrderSideEffects(currentOrder);
    return {
      orderId: currentOrder.id,
      state: "COMPLETED",
      isPaid: true,
      alreadyPaid: true as const,
    };
  }

  const status = await fetchPhonePePaymentStatus(merchantTransactionId);
  const state = status?.state ?? "PENDING";
  let isPaid = state === "COMPLETED";
  const isFailed = state === "FAILED";
  const existingMeta = readPaymentMeta(currentOrder.payment_meta);

  // Verify the gateway-reported amount before trusting a PAID state. On
  // mismatch, hold the order for manual review instead of marking it paid.
  const amountCheck = detectPaidAmountMismatch(
    currentOrder.amount,
    typeof status?.amount === "number" ? status.amount / 100 : null,
  );
  const amountMismatch = isPaid && amountCheck.mismatch;
  if (amountMismatch) {
    console.error(
      `[payments] PhonePe amount mismatch for order ${currentOrder.id}: expected ${amountCheck.expected}, gateway reported ${amountCheck.actual}. Holding order for manual review.`,
    );
    isPaid = false;

    // Alert the seller once (first detection only, not on every retry).
    if (!existingMeta.amountMismatch) {
      await sendSellerOpsAlert(
        `Payment amount mismatch (PhonePe)\nOrder: #${currentOrder.id}\nExpected: INR ${amountCheck.expected}\nGateway reported: INR ${amountCheck.actual ?? "missing"}\nOrder is HELD as unpaid — review it in admin before shipping.`,
      );
    }
  }

  // The `payment_status != 'paid'` guard makes the unpaid->paid transition
  // atomic: concurrent webhook + redirect syncs cannot both run side effects,
  // and a delayed PENDING/FAILED sync can never flip a paid order back.
  const [updated] = await db
    .update(orders)
    .set({
      order_status: isPaid ? "PREPARING" : isFailed ? "canceled" : "pending",
      payment_status: isPaid ? "paid" : "unpaid",
      payment_method: "phonepe",
      payment_provider: "phonepe",
      payment_reference: status?.transactionId ?? merchantTransactionId,
      phonepe_transaction_id: status?.transactionId ?? null,
      phonepe_merchant_transaction_id: merchantTransactionId,
      payment_meta: mergePaymentMeta(existingMeta, {
        phonepeState: state,
        responseCode: status?.responseCode ?? null,
        paymentInstrument: status?.paymentInstrument ?? null,
        ...(amountMismatch
          ? {
              amountMismatch: {
                expected: amountCheck.expected,
                gatewayReported: amountCheck.actual,
                detectedAt: new Date().toISOString(),
              },
            }
          : {}),
      }),
    })
    .where(
      and(eq(orders.id, currentOrder.id), ne(orders.payment_status, "paid")),
    )
    .returning();

  if (!updated) {
    // Lost the race: another sync already marked this order paid and ran the
    // side effects. Report success without repeating them.
    return {
      orderId: currentOrder.id,
      state,
      isPaid: true,
      alreadyPaid: true as const,
    };
  }

  if (isPaid) {
    await runPaidOrderSideEffects(updated);
  } else if (isFailed) {
    await maybeReleaseUnpaidReservation(updated.id, "payment_failed");
  } else {
    await maybeReleaseExpiredReservation(updated.id);
  }

  return {
    orderId: updated.id,
    state,
    isPaid,
  };
}

export async function syncCashfreeOrderPayment(orderId: string) {
  const currentOrder = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });

  if (!currentOrder) {
    throw new Error("Order not found for Cashfree payment sync");
  }

  if (currentOrder.payment_status === "paid") {
    // Complete any side effects a prior attempt missed (idempotent no-op
    // when everything already ran).
    await ensurePaidOrderSideEffects(currentOrder);
    return {
      orderId: currentOrder.id,
      state: "PAID",
      isPaid: true,
      alreadyPaid: true as const,
    };
  }

  const status = await fetchCashfreeOrderStatus(orderId);
  const state = String(status.order_status ?? "ACTIVE").toUpperCase();
  let isPaid = state === "PAID";
  const isTerminalFailure = ["EXPIRED", "TERMINATED", "CANCELLED"].includes(
    state,
  );
  const existingMeta = readPaymentMeta(currentOrder.payment_meta);

  // Verify the gateway-reported amount before trusting a PAID state. On
  // mismatch, hold the order for manual review instead of marking it paid.
  const amountCheck = detectPaidAmountMismatch(
    currentOrder.amount,
    status.order_amount !== undefined && status.order_amount !== null
      ? Number(status.order_amount)
      : null,
  );
  const amountMismatch = isPaid && amountCheck.mismatch;
  if (amountMismatch) {
    console.error(
      `[payments] Cashfree amount mismatch for order ${currentOrder.id}: expected ${amountCheck.expected}, gateway reported ${amountCheck.actual}. Holding order for manual review.`,
    );
    isPaid = false;

    // Alert the seller once (first detection only, not on every retry).
    if (!existingMeta.amountMismatch) {
      await sendSellerOpsAlert(
        `Payment amount mismatch (Cashfree)\nOrder: #${currentOrder.id}\nExpected: INR ${amountCheck.expected}\nGateway reported: INR ${amountCheck.actual ?? "missing"}\nOrder is HELD as unpaid — review it in admin before shipping.`,
      );
    }
  }

  // The `payment_status != 'paid'` guard makes the unpaid->paid transition
  // atomic: concurrent webhook + redirect syncs cannot both run side effects,
  // and a delayed ACTIVE/EXPIRED sync can never flip a paid order back.
  const [updated] = await db
    .update(orders)
    .set({
      order_status: isPaid
        ? "PREPARING"
        : isTerminalFailure
          ? "canceled"
          : "pending",
      payment_status: isPaid ? "paid" : "unpaid",
      payment_method: "cashfree",
      payment_provider: "cashfree",
      payment_reference: status.cf_order_id
        ? String(status.cf_order_id)
        : orderId,
      payment_meta: mergePaymentMeta(existingMeta, {
        cashfreeOrderId: status.order_id ?? orderId,
        cashfreeCfOrderId: status.cf_order_id
          ? String(status.cf_order_id)
          : null,
        cashfreeOrderStatus: state,
        ...(amountMismatch
          ? {
              amountMismatch: {
                expected: amountCheck.expected,
                gatewayReported: amountCheck.actual,
                detectedAt: new Date().toISOString(),
              },
            }
          : {}),
      }),
    })
    .where(
      and(eq(orders.id, currentOrder.id), ne(orders.payment_status, "paid")),
    )
    .returning();

  if (!updated) {
    // Lost the race: another sync already marked this order paid and ran the
    // side effects. Report success without repeating them.
    return {
      orderId: currentOrder.id,
      state,
      isPaid: true,
      alreadyPaid: true as const,
    };
  }

  if (isPaid) {
    await runPaidOrderSideEffects(updated);
  } else if (isTerminalFailure) {
    await maybeReleaseUnpaidReservation(updated.id, "payment_failed");
  } else {
    await maybeReleaseExpiredReservation(updated.id);
  }

  return {
    orderId: updated.id,
    state,
    isPaid,
  };
}

export async function syncRazorpayOrderPayment(input: {
  orderId: string;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
}) {
  const currentOrder = await db.query.orders.findFirst({
    where: eq(orders.id, input.orderId),
  });

  if (!currentOrder) {
    throw new Error("Order not found for Razorpay payment sync");
  }

  if (currentOrder.payment_status === "paid") {
    await ensurePaidOrderSideEffects(currentOrder);
    return {
      orderId: currentOrder.id,
      state: "paid",
      isPaid: true,
      alreadyPaid: true as const,
    };
  }

  const existingMeta = readPaymentMeta(currentOrder.payment_meta);
  const razorpayOrderId = String(
    input.razorpayOrderId ??
      existingMeta.razorpayOrderId ??
      currentOrder.payment_reference ??
      "",
  ).trim();

  if (!razorpayOrderId) {
    throw new Error("Razorpay order id missing for payment sync");
  }

  const razorpayPaymentId = String(
    input.razorpayPaymentId ?? existingMeta.razorpayPaymentId ?? "",
  ).trim();

  const rzpOrder = await fetchRazorpayOrder(razorpayOrderId);
  const rzpPayment = razorpayPaymentId
    ? await fetchRazorpayPayment(razorpayPaymentId)
    : null;

  const notes = (rzpOrder.notes ?? {}) as Record<string, string>;
  const notesShopId = String(notes.shop_order_id ?? "").trim();
  if (notesShopId && notesShopId !== currentOrder.id) {
    throw new Error("Razorpay order does not match this shop order.");
  }

  if (rzpPayment?.order_id && String(rzpPayment.order_id) !== razorpayOrderId) {
    throw new Error("Razorpay payment does not belong to this order.");
  }

  const gatewayAmountRupees = paiseToRupees(
    Number(rzpPayment?.amount ?? rzpOrder.amount ?? Number.NaN),
  );

  const orderStatus = String(rzpOrder.status ?? "").toLowerCase();
  const paymentStatus = String(rzpPayment?.status ?? "").toLowerCase();
  let isPaid = orderStatus === "paid" || paymentStatus === "captured";
  const isFailed = paymentStatus === "failed";

  const amountCheck = detectPaidAmountMismatch(
    currentOrder.amount,
    Number.isFinite(gatewayAmountRupees) ? gatewayAmountRupees : null,
  );
  const amountMismatch = isPaid && amountCheck.mismatch;
  if (amountMismatch) {
    console.error(
      `[payments] Razorpay amount mismatch for order ${currentOrder.id}: expected ${amountCheck.expected}, gateway reported ${amountCheck.actual}. Holding order for manual review.`,
    );
    isPaid = false;

    if (!existingMeta.amountMismatch) {
      await sendSellerOpsAlert(
        `Payment amount mismatch (Razorpay)\nOrder: #${currentOrder.id}\nExpected: INR ${amountCheck.expected}\nGateway reported: INR ${amountCheck.actual ?? "missing"}\nOrder is HELD as unpaid — review it in admin before shipping.`,
      );
    }
  }

  const [updated] = await db
    .update(orders)
    .set({
      order_status: isPaid ? "PREPARING" : isFailed ? "canceled" : "pending",
      payment_status: isPaid ? "paid" : "unpaid",
      payment_method: "razorpay",
      payment_provider: "razorpay",
      payment_reference: razorpayOrderId,
      payment_meta: mergePaymentMeta(existingMeta, {
        razorpayOrderId,
        razorpayPaymentId: razorpayPaymentId || null,
        razorpayOrderStatus: orderStatus,
        razorpayPaymentStatus: paymentStatus || null,
        razorpayMethod: rzpPayment?.method ?? null,
        ...(amountMismatch
          ? {
              amountMismatch: {
                expected: amountCheck.expected,
                gatewayReported: amountCheck.actual,
                detectedAt: new Date().toISOString(),
              },
            }
          : {}),
      }),
    })
    .where(
      and(eq(orders.id, currentOrder.id), ne(orders.payment_status, "paid")),
    )
    .returning();

  if (!updated) {
    return {
      orderId: currentOrder.id,
      state: orderStatus,
      isPaid: true,
      alreadyPaid: true as const,
    };
  }

  if (isPaid) {
    await runPaidOrderSideEffects(updated);
  } else if (isFailed) {
    await maybeReleaseUnpaidReservation(updated.id, "payment_failed");
  } else {
    await maybeReleaseExpiredReservation(updated.id);
  }

  return {
    orderId: updated.id,
    state: orderStatus || paymentStatus,
    isPaid,
  };
}
