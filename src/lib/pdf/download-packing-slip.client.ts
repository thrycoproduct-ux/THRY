import type { AdminOrderListView } from "@/lib/admin/getAdminOrdersList";

type PdfOrderInput = Pick<
  AdminOrderListView,
  | "id"
  | "createdAt"
  | "customerName"
  | "customerMobile"
  | "shippingAddress"
  | "lines"
>;

/** Yield to the browser so INP can paint between heavy PDF work. */
export async function yieldToMainThread(): Promise<void> {
  if (typeof scheduler !== "undefined" && "yield" in scheduler) {
    await (
      scheduler as Scheduler & { yield: () => Promise<void> }
    ).yield();
    return;
  }
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

/** Dynamic import — keeps jsPDF off the initial admin orders bundle. */
export async function downloadAdminOrderPackingSlipPdf(order: PdfOrderInput) {
  const [{ downloadOrderPdf }, { adminOrderToPackingSlip }] = await Promise.all([
    import("@/lib/pdf/packing-slip-pdf"),
    import("@/lib/pdf/admin-order-pdf-label"),
  ]);
  await downloadOrderPdf(adminOrderToPackingSlip(order));
}

export async function downloadAdminOrdersPackingSlipsPdf(
  orders: PdfOrderInput[],
) {
  if (orders.length === 0) return;
  const [{ downloadOrdersPdf }, { adminOrdersToPackingSlips }] =
    await Promise.all([
      import("@/lib/pdf/packing-slip-pdf"),
      import("@/lib/pdf/admin-order-pdf-label"),
    ]);
  await downloadOrdersPdf(adminOrdersToPackingSlips(orders));
}
