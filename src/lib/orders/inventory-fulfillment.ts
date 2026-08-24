import { invalidateStorefrontCache } from "@/lib/cache/invalidate-storefront";
import {
  getIntegrationSetting,
  INTEGRATION_KEYS,
} from "@/lib/integrations/settings";
import { sendSellerOpsAlert } from "@/lib/integrations/whatsapp";
import { mergePaymentMeta, readPaymentMeta } from "@/lib/orders/payment-meta";
import { shouldDeductStockForPaidOrder } from "@/lib/orders/payment-fulfillment";
import {
  confirmStockReservation,
  deductPaidOrderStockAtomic,
  hasActiveStockReservation,
  readReservationLines,
  releaseStockReservation,
} from "@/lib/orders/stock-reservation";
import db from "@/lib/supabase/db";
import { orderLines, orders } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";

type FulfillmentResult = {
  fulfilled: boolean;
  skippedReason?: string;
};

function readSelectedSizes(meta: Record<string, unknown>) {
  const raw = meta.sizes;
  if (!raw || typeof raw !== "object") return {} as Record<string, string>;

  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([productId, size]) => [
      productId,
      String(size ?? "")
        .trim()
        .toUpperCase(),
    ]),
  );
}

async function loadFulfillmentLines(
  orderId: string,
  meta: Record<string, unknown>,
) {
  const reserved = readReservationLines(meta);
  if (reserved.length > 0) return reserved;

  const selectedSizes = readSelectedSizes(meta);
  const lines = await db
    .select({
      productId: orderLines.productId,
      quantity: orderLines.quantity,
      size: orderLines.size,
      selections: orderLines.selections,
    })
    .from(orderLines)
    .where(eq(orderLines.orderId, orderId));

  return lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    ...(line.size
      ? { size: String(line.size).trim().toUpperCase() }
      : selectedSizes[line.productId]
        ? { size: selectedSizes[line.productId] }
        : {}),
    ...(line.selections && typeof line.selections === "object"
      ? { selections: line.selections as Record<string, string> }
      : {}),
  }));
}

export async function fulfillPaidOrderInventory(
  orderId: string,
): Promise<FulfillmentResult> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });

  if (!order) {
    return { fulfilled: false, skippedReason: "order_not_found" };
  }

  if (order.payment_status !== "paid") {
    return { fulfilled: false, skippedReason: "not_paid" };
  }

  const meta = readPaymentMeta(order.payment_meta);
  if (meta.inventoryFulfilled === true) {
    return { fulfilled: true, skippedReason: "already_fulfilled" };
  }

  const shouldDeduct = await shouldDeductStockForPaidOrder({
    paymentProvider: order.payment_provider,
    paymentMeta: meta,
  });

  if (!shouldDeduct) {
    if (hasActiveStockReservation(meta)) {
      await releaseStockReservation(orderId, "non_production_payment");
    }

    await db
      .update(orders)
      .set({
        payment_meta: mergePaymentMeta(meta, {
          inventoryFulfilled: false,
          inventorySkippedReason: "test_or_non_production_payment",
        }),
      })
      .where(eq(orders.id, order.id));

    return {
      fulfilled: false,
      skippedReason: "test_or_non_production_payment",
    };
  }

  const stockControlSetting = await getIntegrationSetting(
    INTEGRATION_KEYS.stockControl,
  );
  if (!stockControlSetting?.isEnabled) {
    return { fulfilled: false, skippedReason: "stock_control_disabled" };
  }

  if (hasActiveStockReservation(meta)) {
    const confirmed = await confirmStockReservation(orderId);
    return {
      fulfilled: confirmed.confirmed,
      skippedReason: confirmed.skippedReason,
    };
  }

  const lines = await loadFulfillmentLines(orderId, meta);
  if (lines.length === 0) {
    return { fulfilled: false, skippedReason: "no_lines" };
  }

  const reservationWasReleased = meta.stockReleased === true;
  const deductResult = await deductPaidOrderStockAtomic(lines);

  if (!deductResult.ok) {
    const issue = reservationWasReleased
      ? "paid_after_reservation_released"
      : "paid_without_active_reservation";

    await db
      .update(orders)
      .set({
        payment_meta: mergePaymentMeta(meta, {
          inventoryFulfilled: false,
          inventoryIssue: issue,
          inventoryIssueAt: new Date().toISOString(),
          inventoryIssueProductId: deductResult.failedProductId ?? null,
        }),
      })
      .where(eq(orders.id, order.id));

    // Paid money but stock could not be deducted — the seller must act
    // (restock, refund, or ship from backup). Alert once, not on retries.
    if (!meta.inventoryIssue) {
      console.error(
        `[inventory] ${issue} for paid order ${order.id} (product ${deductResult.failedProductId ?? "unknown"})`,
      );
      await sendSellerOpsAlert(
        `Inventory problem on a PAID order\nOrder: #${order.id}\nIssue: ${issue.replaceAll("_", " ")}\nProduct: ${deductResult.failedProductId ?? "unknown"}\nStock was NOT deducted — check availability before shipping, refund if needed.`,
      );
    }

    return {
      fulfilled: false,
      skippedReason: reservationWasReleased
        ? "paid_after_reservation_released"
        : "insufficient_stock_after_payment",
    };
  }

  await db
    .update(orders)
    .set({
      payment_meta: mergePaymentMeta(meta, {
        inventoryFulfilled: true,
        inventoryFulfilledAt: new Date().toISOString(),
        inventoryLegacyDeduct: true,
        inventoryLegacyReason: reservationWasReleased
          ? "paid_after_reservation_released"
          : "legacy_order_without_reservation",
      }),
    })
    .where(eq(orders.id, order.id));

  await invalidateStorefrontCache();
  return { fulfilled: true };
}
