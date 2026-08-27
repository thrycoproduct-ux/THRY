import { buildShippingAddressCopyText } from "@/lib/orders/shipping-address-text";
import { formatOrderLineVariant } from "@/lib/orders/order-line-display";
import db from "@/lib/supabase/db";
import {
  address,
  medias,
  orderLines,
  orders,
  products,
} from "@/lib/supabase/schema";
import { keytoUrl } from "@/lib/utils";
import { desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  clampAdminOrdersPageSize,
  type AdminOrdersSegment,
} from "@/lib/admin/admin-orders-pagination";

export {
  ADMIN_ORDERS_DEFAULT_PAGE_SIZE,
  ADMIN_ORDERS_MAX_PAGE_SIZE,
  ADMIN_ORDERS_MIN_PAGE_SIZE,
  clampAdminOrdersPageSize,
  parseAdminOrdersPage,
  type AdminOrdersSegment,
} from "@/lib/admin/admin-orders-pagination";

export type AdminOrderLineView = {
  id: string;
  quantity: number;
  productName: string;
  productCode: string | null;
  variantLabel: string | null;
  imageUrl: string;
  imageAlt: string;
};

export type AdminOrderListView = {
  id: string;
  createdAt: string;
  amount: number;
  orderStatus: string | null;
  paymentStatus: string;
  customerName: string | null;
  customerMobile: string | null;
  shippingAddress: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
  copyAddressText: string;
  lines: AdminOrderLineView[];
};

export type AdminOrdersListParams = {
  segment: AdminOrdersSegment;
  page?: number;
  pageSize?: number;
};

export type AdminOrdersListResult = {
  rows: AdminOrderListView[];
  totalCount: number;
  page: number;
  pageSize: number;
};

/**
 * SQL equivalents of the JS classifiers in `paymentStatus.ts`. Kept in sync so
 * server-side pagination selects exactly the same orders as the old in-memory
 * `isPaidPaymentStatus` / `needsPaymentAttention` filters.
 */
function buildSegmentWhereClause(segment: AdminOrdersSegment): SQL {
  const paymentStatus = sql`lower(trim(${orders.payment_status}))`;
  const orderStatus = sql`lower(trim(coalesce(${orders.order_status}, '')))`;

  if (segment === "paid") {
    return sql`${paymentStatus} in ('paid', 'success', 'captured')`;
  }

  // "Needs attention": not cancelled AND (order pending OR payment unpaid/pending/failed).
  return sql`${orderStatus} <> 'cancelled' and (${orderStatus} = 'pending' or ${paymentStatus} in ('unpaid', 'pending', 'failed'))`;
}

async function countOrders(where: SQL): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(where);
  return Number(rows[0]?.count ?? 0);
}

/** Counts for the summary cards — one aggregate round-trip, no row payloads. */
export async function getAdminOrdersCounts(): Promise<{
  paid: number;
  pending: number;
}> {
  const paymentStatus = sql`lower(trim(${orders.payment_status}))`;
  const orderStatus = sql`lower(trim(coalesce(${orders.order_status}, '')))`;
  const rows = await db
    .select({
      paid: sql<number>`count(*) filter (where ${paymentStatus} in ('paid', 'success', 'captured'))::int`,
      pending: sql<number>`count(*) filter (where ${orderStatus} <> 'cancelled' and (${orderStatus} = 'pending' or ${paymentStatus} in ('unpaid', 'pending', 'failed')))::int`,
    })
    .from(orders);
  return {
    paid: Number(rows[0]?.paid ?? 0),
    pending: Number(rows[0]?.pending ?? 0),
  };
}

async function loadOrderLinesByOrderId(
  orderIds: string[],
): Promise<Map<string, AdminOrderLineView[]>> {
  const linesByOrderId = new Map<string, AdminOrderLineView[]>();
  if (orderIds.length === 0) return linesByOrderId;

  const lineRows = await db
    .select({
      id: orderLines.id,
      orderId: orderLines.orderId,
      quantity: orderLines.quantity,
      size: orderLines.size,
      selections: orderLines.selections,
      productName: products.name,
      productCode: products.productCode,
      imageKey: medias.key,
      imageAlt: medias.alt,
    })
    .from(orderLines)
    .leftJoin(products, eq(orderLines.productId, products.id))
    .leftJoin(medias, eq(products.featuredImageId, medias.id))
    .where(inArray(orderLines.orderId, orderIds));

  for (const row of lineRows) {
    const line: AdminOrderLineView = {
      id: row.id,
      quantity: row.quantity,
      productName: row.productName || "Product",
      productCode: row.productCode ?? null,
      variantLabel: formatOrderLineVariant({
        size: row.size,
        selections: row.selections as Record<string, unknown> | null,
      }),
      imageUrl: keytoUrl(row.imageKey ?? undefined),
      imageAlt: row.imageAlt || row.productName || "Product image",
    };

    const existing = linesByOrderId.get(row.orderId) ?? [];
    existing.push(line);
    linesByOrderId.set(row.orderId, existing);
  }

  return linesByOrderId;
}

/**
 * Server-side paginated admin orders for a single segment (paid / pending).
 * Only the current page of orders — and their line items — are loaded, so the
 * page stays fast as the orders table grows.
 */
export async function getAdminOrdersList(
  params: AdminOrdersListParams,
): Promise<AdminOrdersListResult> {
  const pageSize = clampAdminOrdersPageSize(params.pageSize);
  const requestedPage = Math.max(1, Math.round(params.page ?? 1));
  const where = buildSegmentWhereClause(params.segment);

  const totalCount = await countOrders(where);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;

  const orderRows = await db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      amount: orders.amount,
      orderStatus: orders.order_status,
      paymentStatus: orders.payment_status,
      customerName: orders.name,
      customerMobile: orders.customer_mobile,
      addressLine1: address.line1,
      addressLine2: address.line2,
      addressCity: address.city,
      addressState: address.state,
      addressPostalCode: address.postal_code,
      addressCountry: address.country,
    })
    .from(orders)
    .leftJoin(address, eq(orders.addressId, address.id))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(pageSize)
    .offset(offset);

  if (orderRows.length === 0) {
    return { rows: [], totalCount, page, pageSize };
  }

  const linesByOrderId = await loadOrderLinesByOrderId(
    orderRows.map((row) => row.id),
  );

  const rows = orderRows.map((row) => {
    const shippingAddress = row.addressLine1
      ? {
          line1: row.addressLine1,
          line2: row.addressLine2,
          city: row.addressCity,
          state: row.addressState,
          postalCode: row.addressPostalCode,
          country: row.addressCountry,
        }
      : null;

    return {
      id: row.id,
      createdAt: new Date(row.createdAt).toISOString(),
      amount: Number(row.amount),
      orderStatus: row.orderStatus,
      paymentStatus: row.paymentStatus,
      customerName: row.customerName,
      customerMobile: row.customerMobile,
      shippingAddress,
      copyAddressText: buildShippingAddressCopyText({
        customerName: row.customerName,
        customerMobile: row.customerMobile,
        shippingAddress,
      }),
      lines: linesByOrderId.get(row.id) ?? [],
    } satisfies AdminOrderListView;
  });

  return { rows, totalCount, page, pageSize };
}
