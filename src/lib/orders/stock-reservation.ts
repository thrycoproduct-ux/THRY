import { invalidateStorefrontCache } from "@/lib/cache/invalidate-storefront";
import { withRetry } from "@/lib/resilience";
import { mergePaymentMeta, readPaymentMeta } from "@/lib/orders/payment-meta";
import {
  getActiveOptionGroups,
  getProductSizeConfigKey,
  normalizeProductSizeConfig,
  resolveOptionSelections,
  serializeProductSizeConfig,
  type OptionSelections,
  type ProductSizeConfig,
} from "@/lib/products/sizeConfig";
import db from "@/lib/supabase/db";
import { getTransactionalDb } from "@/lib/supabase/transactional-db";
import {
  apiSettings,
  orderLines,
  orders,
  products,
  type SelectOrders,
} from "@/lib/supabase/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/lib/supabase/schema";

import {
  PAYMENT_SESSION_HOLD_MINUTES,
  STOCK_HOLD_PRE_PAYMENT_MINUTES,
  stockHoldMinutesAfterPaymentSessionOpened,
} from "@/lib/orders/stock-reservation-policy";
import {
  buildReservationExpiryIso,
  canReleaseOrphanUnpaidHold,
  hasActiveStockReservation,
  isReservationExpired,
  readReservationLines,
  shouldReserveStockAtCheckout,
  STOCK_RESERVATION_TTL_MINUTES,
  type StockReservationLine,
} from "@/lib/orders/stock-reservation-helpers";

export {
  buildReservationExpiryIso,
  canReleaseOrphanUnpaidHold,
  hasActiveStockReservation,
  isReservationExpired,
  readReservationLines,
  shouldReserveStockAtCheckout,
  STOCK_RESERVATION_TTL_MINUTES,
  type StockReservationLine,
};

export class StockReservationError extends Error {
  readonly productId: string;
  readonly productName?: string;

  constructor(message: string, productId: string, productName?: string) {
    super(message);
    this.name = "StockReservationError";
    this.productId = productId;
    this.productName = productName;
  }
}

type DbTx = PostgresJsDatabase<typeof schema>;

type ReserveInput = {
  lines: StockReservationLine[];
  selectedSizes: Record<string, string>;
  selectedSelections?: Record<string, OptionSelections>;
  sizeConfigs: Map<string, ProductSizeConfig>;
  productNames: Map<string, string>;
};

function applyQtyDeltaToGroups(
  config: ProductSizeConfig,
  selections: OptionSelections,
  quantityDelta: number,
): ProductSizeConfig | null {
  const active = getActiveOptionGroups(config);
  if (active.length === 0) return config;

  const resolved = resolveOptionSelections({
    sizeConfig: config,
    selections,
  });

  if (quantityDelta < 0) {
    for (const group of active) {
      const selected = String(resolved[group.id] ?? "")
        .trim()
        .toUpperCase();
      const option = group.options.find((item) => {
        const optionSize = String(item.value ?? item.size ?? "")
          .trim()
          .toUpperCase();
        return selected ? optionSize === selected : !optionSize;
      });
      if (!option) return null;
      if (Number(option.qty ?? 0) < Math.abs(quantityDelta)) return null;
    }
  }

  const nextGroups = config.groups.map((group) => {
    if (!active.some((g) => g.id === group.id)) return group;
    const selected = String(resolved[group.id] ?? "")
      .trim()
      .toUpperCase();
    return {
      ...group,
      options: group.options.map((item) => {
        const optionSize = String(item.value ?? item.size ?? "")
          .trim()
          .toUpperCase();
        const matches = selected ? optionSize === selected : !optionSize;
        if (!matches) return item;
        return {
          ...item,
          qty: Math.max(0, Number(item.qty ?? 0) + quantityDelta),
        };
      }),
    };
  });

  return normalizeProductSizeConfig({
    enabled: config.enabled,
    groups: nextGroups,
  });
}

async function lockAndDecrementOptionStock(
  tx: DbTx,
  productId: string,
  selections: OptionSelections,
  quantity: number,
  selectedSize?: string,
) {
  const key = getProductSizeConfigKey(productId);
  const locked = await tx.execute(
    sql`SELECT key, value FROM api_settings WHERE key = ${key} FOR UPDATE`,
  );

  const row = locked.at(0) as { key?: string; value?: unknown } | undefined;
  if (!row) {
    return false;
  }

  const config = normalizeProductSizeConfig(row.value);
  if (!config.enabled || getActiveOptionGroups(config).length === 0) {
    return true;
  }

  const resolved = resolveOptionSelections({
    sizeConfig: config,
    selections,
    selectedSize,
  });
  const next = applyQtyDeltaToGroups(config, resolved, -quantity);
  if (!next) return false;

  const value = serializeProductSizeConfig(next);

  await tx
    .insert(apiSettings)
    .values({
      key,
      value,
      isEnabled: next.enabled,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: apiSettings.key,
      set: {
        value,
        isEnabled: next.enabled,
        updatedAt: new Date().toISOString(),
      },
    });

  return true;
}

async function lockAndDecrementProductStock(
  tx: DbTx,
  productId: string,
  quantity: number,
) {
  const [updated] = await tx
    .update(products)
    .set({
      stock: sql`${products.stock} - ${quantity}`,
    })
    .where(and(eq(products.id, productId), gte(products.stock, quantity)))
    .returning({ id: products.id });

  return Boolean(updated);
}

async function incrementProductStock(
  tx: DbTx,
  productId: string,
  quantity: number,
) {
  await tx
    .update(products)
    .set({
      stock: sql`${products.stock} + ${quantity}`,
    })
    .where(eq(products.id, productId));
}

async function incrementOptionStock(
  tx: DbTx,
  productId: string,
  selections: OptionSelections,
  quantity: number,
  selectedSize?: string,
) {
  const key = getProductSizeConfigKey(productId);
  const locked = await tx.execute(
    sql`SELECT key, value FROM api_settings WHERE key = ${key} FOR UPDATE`,
  );
  const row = locked.at(0) as { key?: string; value?: unknown } | undefined;
  const config = normalizeProductSizeConfig(row?.value);
  if (!config.enabled || getActiveOptionGroups(config).length === 0) {
    return;
  }

  const resolved = resolveOptionSelections({
    sizeConfig: config,
    selections,
    selectedSize,
  });
  const next = applyQtyDeltaToGroups(config, resolved, quantity);
  if (!next) return;

  const value = serializeProductSizeConfig(next);

  await tx
    .insert(apiSettings)
    .values({
      key,
      value,
      isEnabled: next.enabled,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: apiSettings.key,
      set: {
        value,
        isEnabled: next.enabled,
        updatedAt: new Date().toISOString(),
      },
    });
}

export async function reserveStockInTransaction(
  tx: DbTx,
  input: ReserveInput,
): Promise<Record<string, unknown>> {
  const reservedAt = new Date().toISOString();
  const paymentSessionTtlMinutes = stockHoldMinutesAfterPaymentSessionOpened();
  const expiresAt = buildReservationExpiryIso(
    Date.now(),
    STOCK_HOLD_PRE_PAYMENT_MINUTES,
  );
  const reservationLines: StockReservationLine[] = [];

  const sortedLines = [...input.lines].sort((a, b) =>
    a.productId.localeCompare(b.productId),
  );

  for (const line of sortedLines) {
    const productName = input.productNames.get(line.productId);
    const selectedSize = line.size ?? input.selectedSizes[line.productId] ?? "";
    const selections =
      line.selections ??
      input.selectedSelections?.[line.productId] ??
      (selectedSize
        ? resolveOptionSelections({
            sizeConfig: input.sizeConfigs.get(line.productId),
            selectedSize,
          })
        : {});

    const productReserved = await lockAndDecrementProductStock(
      tx,
      line.productId,
      line.quantity,
    );

    if (!productReserved) {
      throw new StockReservationError(
        productName
          ? `${productName} just sold out. Please refresh and try again.`
          : "An item in your cart just sold out. Please refresh and try again.",
        line.productId,
        productName,
      );
    }

    const sizeConfig = input.sizeConfigs.get(line.productId);
    const hasConfiguredSizes =
      Boolean(sizeConfig?.enabled) &&
      getActiveOptionGroups(sizeConfig).length > 0;

    if (hasConfiguredSizes) {
      const sizeReserved = await lockAndDecrementOptionStock(
        tx,
        line.productId,
        selections,
        line.quantity,
      );

      if (!sizeReserved) {
        throw new StockReservationError(
          productName
            ? `${productName} is no longer available for the selected options.`
            : "Selected options are no longer available.",
          line.productId,
          productName,
        );
      }
    }

    reservationLines.push({
      productId: line.productId,
      quantity: line.quantity,
      ...(selectedSize ? { size: selectedSize } : {}),
      ...(Object.keys(selections).length > 0 ? { selections } : {}),
    });
  }

  return {
    stockReserved: true,
    stockReservedAt: reservedAt,
    stockReservationExpiresAt: expiresAt,
    stockReservationLines: reservationLines,
    stockReservationTtlMinutes: paymentSessionTtlMinutes,
    paymentSessionHoldMinutes: PAYMENT_SESSION_HOLD_MINUTES,
    stockReservationPhase: "pre_payment",
  };
}

export async function extendStockReservationExpiry(orderId: string) {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });
  if (!order) return;

  const meta = readPaymentMeta(order.payment_meta);
  if (!hasActiveStockReservation(meta)) return;

  const paymentSessionTtlMinutes = stockHoldMinutesAfterPaymentSessionOpened();
  const openedAt = new Date().toISOString();

  await db
    .update(orders)
    .set({
      payment_meta: mergePaymentMeta(meta, {
        stockReservationExpiresAt: buildReservationExpiryIso(
          Date.now(),
          paymentSessionTtlMinutes,
        ),
        stockReservationTtlMinutes: paymentSessionTtlMinutes,
        paymentSessionHoldMinutes: PAYMENT_SESSION_HOLD_MINUTES,
        stockReservationPhase: "payment_session",
        paymentSessionOpenedAt: openedAt,
      }),
    })
    .where(eq(orders.id, orderId));
}

type DeductLine = StockReservationLine;

function readSelectedSizesFromMeta(meta: Record<string, unknown>) {
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

async function loadOrderLinesForRelease(
  tx: DbTx,
  orderId: string,
  meta: Record<string, unknown>,
): Promise<StockReservationLine[]> {
  const reserved = readReservationLines(meta);
  if (reserved.length > 0) return reserved;

  const selectedSizes = readSelectedSizesFromMeta(meta);
  const lines = await tx
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

export async function deductPaidOrderStockAtomic(
  lines: DeductLine[],
): Promise<{ ok: boolean; failedProductId?: string }> {
  try {
    await getTransactionalDb().transaction(async (tx) => {
      const sortedLines = [...lines].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      );

      for (const line of sortedLines) {
        const productOk = await lockAndDecrementProductStock(
          tx,
          line.productId,
          line.quantity,
        );
        if (!productOk) {
          throw new StockReservationError(
            "Insufficient stock after payment",
            line.productId,
          );
        }

        if (
          line.size ||
          (line.selections && Object.keys(line.selections).length > 0)
        ) {
          const sizeOk = await lockAndDecrementOptionStock(
            tx,
            line.productId,
            line.selections ?? {},
            line.quantity,
            line.size,
          );
          if (!sizeOk) {
            throw new StockReservationError(
              "Insufficient size stock after payment",
              line.productId,
            );
          }
        }
      }
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof StockReservationError) {
      return { ok: false, failedProductId: error.productId };
    }
    throw error;
  }
}

export async function confirmStockReservation(
  orderId: string,
): Promise<{ confirmed: boolean; skippedReason?: string }> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });

  if (!order) {
    return { confirmed: false, skippedReason: "order_not_found" };
  }

  const meta = readPaymentMeta(order.payment_meta);
  if (meta.inventoryFulfilled === true) {
    return { confirmed: true, skippedReason: "already_fulfilled" };
  }

  if (!hasActiveStockReservation(meta)) {
    return { confirmed: false, skippedReason: "no_active_reservation" };
  }

  await db
    .update(orders)
    .set({
      payment_meta: mergePaymentMeta(meta, {
        inventoryFulfilled: true,
        inventoryFulfilledAt: new Date().toISOString(),
        stockReservationConsumed: true,
        stockReservationConfirmedAt: new Date().toISOString(),
      }),
    })
    .where(eq(orders.id, orderId));

  await invalidateStorefrontCache();
  return { confirmed: true };
}

export async function releaseStockReservation(
  orderId: string,
  reason: string,
  options?: { allowOrphanFallback?: boolean },
): Promise<{ released: boolean; skippedReason?: string }> {
  let released = false;
  let skippedReason: string | undefined;

  await getTransactionalDb().transaction(async (tx) => {
    const locked = await tx.execute(
      sql`SELECT id, payment_status, payment_meta, created_at FROM orders WHERE id = ${orderId} FOR UPDATE`,
    );
    const row = locked.at(0) as
      | {
          id?: string;
          payment_status?: string;
          payment_meta?: Record<string, unknown> | null;
          created_at?: string;
        }
      | undefined;

    if (!row?.id) {
      skippedReason = "order_not_found";
      return;
    }

    if (row.payment_status === "paid") {
      skippedReason = "already_paid";
      return;
    }

    const meta = readPaymentMeta(row.payment_meta);
    if (
      meta.inventoryFulfilled === true ||
      meta.stockReservationConsumed === true
    ) {
      skippedReason = "reservation_consumed";
      return;
    }

    if (meta.stockReleased === true) {
      skippedReason = "already_released";
      released = true;
      return;
    }

    const lines = readReservationLines(meta);
    const hasTrackedReservation =
      meta.stockReserved === true && lines.length > 0;

    if (hasTrackedReservation) {
      const sortedLines = [...lines].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      );

      for (const line of sortedLines) {
        await incrementProductStock(tx, line.productId, line.quantity);
        if (
          line.size ||
          (line.selections && Object.keys(line.selections).length > 0)
        ) {
          await incrementOptionStock(
            tx,
            line.productId,
            line.selections ?? {},
            line.quantity,
            line.size,
          );
        }
      }

      await tx
        .update(orders)
        .set({
          payment_meta: mergePaymentMeta(meta, {
            stockReleased: true,
            stockReleasedAt: new Date().toISOString(),
            stockReleaseReason: reason,
          }),
        })
        .where(eq(orders.id, orderId));

      released = true;
      return;
    }

    if (!options?.allowOrphanFallback) {
      skippedReason = "no_active_reservation";
      return;
    }

    if (!canReleaseOrphanUnpaidHold(meta, row.created_at, reason)) {
      skippedReason = "orphan_not_eligible";
      return;
    }

    const orphanLines = await loadOrderLinesForRelease(tx, orderId, meta);
    if (orphanLines.length === 0) {
      skippedReason = "no_release_lines";
      return;
    }

    const sortedOrphanLines = [...orphanLines].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );

    for (const line of sortedOrphanLines) {
      await incrementProductStock(tx, line.productId, line.quantity);
      if (
        line.size ||
        (line.selections && Object.keys(line.selections).length > 0)
      ) {
        await incrementOptionStock(
          tx,
          line.productId,
          line.selections ?? {},
          line.quantity,
          line.size,
        );
      }
    }

    await tx
      .update(orders)
      .set({
        payment_meta: mergePaymentMeta(meta, {
          stockReleased: true,
          stockReleasedAt: new Date().toISOString(),
          stockReleaseReason: reason,
          stockOrphanRelease: true,
        }),
      })
      .where(eq(orders.id, orderId));

    released = true;
  });

  if (released) {
    await invalidateStorefrontCache();
  }

  return {
    released,
    skippedReason: released ? undefined : skippedReason ?? "release_failed",
  };
}

export async function releaseExpiredStockReservations(options?: {
  lookbackHours?: number;
  limit?: number;
}) {
  const lookbackHours = options?.lookbackHours ?? 168;
  const limit = options?.limit ?? 100;
  const lookbackDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  const candidates = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.payment_status, "unpaid"),
        gte(orders.createdAt, lookbackDate),
      ),
    )
    .orderBy(orders.createdAt)
    .limit(limit);

  let released = 0;
  let failed = 0;

  for (const order of candidates) {
    const meta = readPaymentMeta(order.payment_meta);
    const shouldReleaseTracked =
      hasActiveStockReservation(meta) && isReservationExpired(meta);
    const shouldReleaseOrphan = canReleaseOrphanUnpaidHold(
      meta,
      order.createdAt,
      "reservation_expired",
    );

    if (!shouldReleaseTracked && !shouldReleaseOrphan) continue;

    try {
      const result = await withRetry(
        () =>
          releaseStockReservation(order.id, "reservation_expired", {
            allowOrphanFallback: true,
          }),
        { label: `stock:release:${order.id}`, attempts: 3 },
      );
      if (result.released) released += 1;
    } catch (error) {
      failed += 1;
      console.warn(
        `[stock-reservation] expired release failed for order ${order.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return { scanned: candidates.length, released, failed };
}

export async function loadOrderReservationLines(
  order: SelectOrders,
): Promise<StockReservationLine[]> {
  const meta = readPaymentMeta(order.payment_meta);
  const reserved = readReservationLines(meta);
  if (reserved.length > 0) return reserved;

  const lines = await db
    .select({
      productId: orderLines.productId,
      quantity: orderLines.quantity,
      size: orderLines.size,
      selections: orderLines.selections,
    })
    .from(orderLines)
    .where(eq(orderLines.orderId, order.id));

  const selectedSizes = Object.fromEntries(
    Object.entries(
      (meta.sizes as Record<string, unknown> | undefined) ?? {},
    ).map(([productId, size]) => [
      productId,
      String(size ?? "")
        .trim()
        .toUpperCase(),
    ]),
  );

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
