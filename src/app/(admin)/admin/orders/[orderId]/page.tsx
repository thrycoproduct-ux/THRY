import AdminShell from "@/components/admin/AdminShell";
import AdminOrderDetailView from "@/features/orders/components/admin/AdminOrderDetailView";
import {
  formatOrderLineVariant,
  resolveOrderLineImageAlt,
  resolveOrderLineImageKey,
  resolveOrderLineProductCode,
  resolveOrderLineProductName,
  resolveOrderLineProductSlug,
} from "@/lib/orders/order-line-display";
import { buildOrderPaymentBreakdown } from "@/lib/orders/order-payment-breakdown";
import { buildShippingAddressCopyText } from "@/lib/orders/shipping-address-text";
import { getOrderDispatchInfo } from "@/lib/dispatch/get-order-dispatch-info";
import { buildDispatchNotificationText } from "@/lib/dispatch/dispatch-message";
import { formatOrderDateTimeIst } from "@/lib/datetime/india";
import { keytoUrl } from "@/lib/utils";
import db from "@/lib/supabase/db";
import {
  getProductSizeConfigsByProductIds,
  optionGroupDisplayNames,
} from "@/lib/products/sizeConfig";
import { getSessionUser, isAdminUser } from "@/lib/auth/admin";
import {
  address,
  dispatchCouriers,
  medias,
  orderLines,
  orders,
  products,
} from "@/lib/supabase/schema";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type AdminOrderDetailPageProps = {
  params: Promise<{
    orderId: string;
  }>;
};

function buildCourierCopyText(payload: {
  orderId: string;
  createdAt: string;
  customerName: string | null;
  customerMobile: string | null;
  amount: number;
  items: {
    productName: string;
    productCode: string | null;
    quantity: number;
    variantLabel?: string | null;
  }[];
  addressText: string;
  dispatchInfo?: {
    courierName: string;
    trackingNumber: string | null;
    dispatchedAt: string;
    trackingUrl: string | null;
  } | null;
}) {
  const itemLines = payload.items.map((item, idx) => {
    const code = item.productCode ? ` [${item.productCode}]` : "";
    const variant = item.variantLabel ? ` (${item.variantLabel})` : "";
    return `${idx + 1}. ${item.productName}${code}${variant} x ${item.quantity}`;
  });

  const base = [
    `ORDER DISPATCH NOTE`,
    `Order ID: ${payload.orderId}`,
    `Date: ${formatOrderDateTimeIst(payload.createdAt)}`,
    `Customer: ${payload.customerName || "Customer"}`,
    `Mobile: ${payload.customerMobile || "-"}`,
    `Amount: INR ${payload.amount}`,
    ``,
    `Items to Pack:`,
    ...itemLines,
    ``,
    `Shipping Address:`,
    payload.addressText,
  ];

  if (payload.dispatchInfo) {
    base.push(
      "",
      `Courier: ${payload.dispatchInfo.courierName}`,
      `Dispatched: ${formatOrderDateTimeIst(payload.dispatchInfo.dispatchedAt)}`,
    );
    if (payload.dispatchInfo.trackingNumber) {
      base.push(`Tracking number: ${payload.dispatchInfo.trackingNumber}`);
    }
    if (payload.dispatchInfo.trackingUrl) {
      base.push(`Track here: ${payload.dispatchInfo.trackingUrl}`);
    }
  }

  return base.join("\n");
}

async function OrderDetailPage({ params }: AdminOrderDetailPageProps) {
  const { orderId } = await params;

  const user = await getSessionUser();
  const admin = await isAdminUser(user);
  if (!user || !admin) return notFound();

  const orderRows = await db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      amount: orders.amount,
      currency: orders.currency,
      orderStatus: orders.order_status,
      paymentStatus: orders.payment_status,
      paymentProvider: orders.payment_provider,
      paymentMethod: orders.payment_method,
      paymentReference: orders.payment_reference,
      paymentMeta: orders.payment_meta,
      customerName: orders.name,
      customerEmail: orders.email,
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
    .where(eq(orders.id, orderId))
    .limit(1);

  const order = orderRows[0];
  if (!order) return notFound();

  const lineRows = await db
    .select({
      id: orderLines.id,
      productId: orderLines.productId,
      quantity: orderLines.quantity,
      unitPrice: orderLines.price,
      size: orderLines.size,
      selections: orderLines.selections,
      productName: products.name,
      productSlug: products.slug,
      productCode: products.productCode,
      productNameSnapshot: orderLines.productNameSnapshot,
      productSlugSnapshot: orderLines.productSlugSnapshot,
      productCodeSnapshot: orderLines.productCodeSnapshot,
      productImageKeySnapshot: orderLines.productImageKeySnapshot,
      imageKey: medias.key,
      imageAlt: medias.alt,
    })
    .from(orderLines)
    .leftJoin(products, eq(orderLines.productId, products.id))
    .leftJoin(medias, eq(products.featuredImageId, medias.id))
    .where(eq(orderLines.orderId, orderId));

  const sizeConfigs = await getProductSizeConfigsByProductIds(
    lineRows
      .map((row) => row.productId)
      .filter((id): id is string => Boolean(id)),
  );

  const itemViews = lineRows.map((row) => {
    const unitPrice = Number(row.unitPrice ?? 0);
    const productName = resolveOrderLineProductName(row);
    const imageKey = resolveOrderLineImageKey(row);
    return {
      id: row.id,
      productId: row.productId,
      productName,
      productSlug: resolveOrderLineProductSlug(row),
      productCode: resolveOrderLineProductCode(row),
      variantLabel: formatOrderLineVariant({
        size: row.size,
        selections: row.selections as Record<string, unknown> | null,
        groupNames: row.productId
          ? optionGroupDisplayNames(sizeConfigs.get(row.productId))
          : undefined,
      }),
      imageUrl: keytoUrl(imageKey ?? undefined),
      imageAlt: resolveOrderLineImageAlt(row),
      quantity: row.quantity,
      unitPrice,
      lineTotal: unitPrice * row.quantity,
    };
  });

  const shippingAddress = order.addressLine1
    ? {
        line1: order.addressLine1,
        line2: order.addressLine2,
        city: order.addressCity,
        state: order.addressState,
        postalCode: order.addressPostalCode,
        country: order.addressCountry,
      }
    : null;

  const orderView = {
    id: order.id,
    createdAt: new Date(order.createdAt).toISOString(),
    amount: Number(order.amount),
    currency: order.currency || "INR",
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentProvider: order.paymentProvider,
    paymentMethod: order.paymentMethod,
    paymentReference: order.paymentReference,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerMobile: order.customerMobile,
    shippingAddress,
    paymentBreakdown: buildOrderPaymentBreakdown({
      paymentMeta: order.paymentMeta,
      orderAmount: Number(order.amount),
      lineItems: itemViews.map((item) => ({
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
    }),
  };

  const dispatchInfo = await getOrderDispatchInfo(orderId);

  const addressText = buildShippingAddressCopyText({
    customerName: orderView.customerName,
    customerMobile: orderView.customerMobile,
    shippingAddress: orderView.shippingAddress,
  });
  const courierCopyText = buildCourierCopyText({
    orderId: orderView.id,
    createdAt: orderView.createdAt,
    customerName: orderView.customerName,
    customerMobile: orderView.customerMobile,
    amount: orderView.amount,
    items: itemViews.map((item) => ({
      productName: item.productName,
      productCode: item.productCode,
      quantity: item.quantity,
      variantLabel: item.variantLabel,
    })),
    addressText,
    dispatchInfo: dispatchInfo
      ? {
          courierName: dispatchInfo.courierName,
          trackingNumber: dispatchInfo.trackingNumber,
          dispatchedAt: dispatchInfo.dispatchedAt,
          trackingUrl: dispatchInfo.trackingUrl,
        }
      : null,
  });

  const dispatchNotificationText = dispatchInfo
    ? buildDispatchNotificationText({
        orderId: orderView.id,
        customerName: orderView.customerName,
        courierName: dispatchInfo.courierName,
        trackingNumber: dispatchInfo.trackingNumber,
        dispatchedAt: dispatchInfo.dispatchedAt,
        trackingUrlTemplate: dispatchInfo.trackingUrlTemplate,
      })
    : null;

  const dispatchCouriersList = await db
    .select({
      id: dispatchCouriers.id,
      name: dispatchCouriers.name,
      trackingUrlTemplate: dispatchCouriers.trackingUrlTemplate,
    })
    .from(dispatchCouriers)
    .where(eq(dispatchCouriers.isActive, true))
    .orderBy(asc(dispatchCouriers.name));

  return (
    <AdminShell
      heading={`Order #${orderView.id}`}
      description="Packing-ready order details with shipping address and quick copy for courier."
      showBackButton
    >
      <AdminOrderDetailView
        order={orderView}
        items={itemViews}
        copyAddressText={addressText}
        courierCopyText={courierCopyText}
        dispatchCouriers={dispatchCouriersList}
        dispatchInfo={dispatchInfo}
        dispatchNotificationText={dispatchNotificationText}
        adminUserId={user.id}
      />
    </AdminShell>
  );
}

export default OrderDetailPage;
