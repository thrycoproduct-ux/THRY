import db from "@/lib/supabase/db";
import { medias, orderLines, orders, products } from "@/lib/supabase/schema";
import { desc, eq, inArray } from "drizzle-orm";

export type UserOrderLineView = {
  id: string;
  productName: string;
  productSlug: string | null;
  productDescription: string | null;
  imageKey: string | null;
  imageAlt: string | null;
};

export type UserOrderListView = {
  id: string;
  internalRef: string | null;
  createdAt: string;
  amount: number;
  orderStatus: string | null;
  paymentStatus: string;
  lines: UserOrderLineView[];
};

const DEFAULT_USER_ORDERS_LIMIT = 20;

export async function getUserOrdersList(
  userId: string,
  limit = DEFAULT_USER_ORDERS_LIMIT,
): Promise<UserOrderListView[]> {
  const safeLimit = Math.min(Math.max(Math.round(limit), 1), 100);

  const orderRows = await db
    .select({
      id: orders.id,
      internalRef: orders.internal_ref,
      createdAt: orders.createdAt,
      amount: orders.amount,
      orderStatus: orders.order_status,
      paymentStatus: orders.payment_status,
    })
    .from(orders)
    .where(eq(orders.user_id, userId))
    .orderBy(desc(orders.createdAt))
    .limit(safeLimit);

  if (orderRows.length === 0) return [];

  const orderIds = orderRows.map((row) => row.id);
  const lineRows = await db
    .select({
      id: orderLines.id,
      orderId: orderLines.orderId,
      productName: products.name,
      productSlug: products.slug,
      productDescription: products.description,
      imageKey: medias.key,
      imageAlt: medias.alt,
    })
    .from(orderLines)
    .leftJoin(products, eq(orderLines.productId, products.id))
    .leftJoin(medias, eq(products.featuredImageId, medias.id))
    .where(inArray(orderLines.orderId, orderIds));

  const linesByOrder = new Map<string, UserOrderLineView[]>();
  for (const line of lineRows) {
    const current = linesByOrder.get(line.orderId) ?? [];
    current.push({
      id: line.id,
      productName: line.productName ?? "Product",
      productSlug: line.productSlug,
      productDescription: line.productDescription,
      imageKey: line.imageKey,
      imageAlt: line.imageAlt,
    });
    linesByOrder.set(line.orderId, current);
  }

  return orderRows.map((row) => ({
    id: row.id,
    internalRef: row.internalRef ?? null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    amount: Number(row.amount),
    orderStatus: row.orderStatus,
    paymentStatus: row.paymentStatus,
    lines: linesByOrder.get(row.id) ?? [],
  }));
}
