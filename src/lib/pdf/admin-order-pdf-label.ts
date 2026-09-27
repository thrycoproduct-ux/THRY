import type { AdminOrderListView } from "@/lib/admin/getAdminOrdersList";
import type { PackingSlipOrder } from "@/lib/pdf/packing-slip-format";

export function adminOrderToPackingSlip(
  order: Pick<
    AdminOrderListView,
    | "id"
    | "internalRef"
    | "createdAt"
    | "customerName"
    | "customerMobile"
    | "shippingAddress"
    | "lines"
  >,
): PackingSlipOrder {
  return {
    id: order.id,
    internalRef: order.internalRef ?? null,
    createdAt: order.createdAt,
    customerName: order.customerName,
    customerMobile: order.customerMobile,
    shippingAddress: order.shippingAddress,
    items: (order.lines ?? []).map((line) => ({
      name: line.productName,
      quantity: line.quantity,
      imageUrl: line.imageUrl,
      variantLabel: line.variantLabel,
    })),
  };
}

export function adminOrdersToPackingSlips(
  orders: Parameters<typeof adminOrderToPackingSlip>[0][],
): PackingSlipOrder[] {
  return orders.map((order) => adminOrderToPackingSlip(order));
}
