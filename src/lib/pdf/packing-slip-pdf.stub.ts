/** Server stub — packing-slip PDF + jsPDF are browser-only (Workers Free 3 MiB). */

export type PackingSlipItem = {
  name: string;
  quantity: number;
  imageUrl: string;
};

export type PackingSlipOrder = {
  id: string;
  createdAt: string;
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
  items: PackingSlipItem[];
};

export async function downloadOrderPdf(_order: PackingSlipOrder) {
  throw new Error("Packing slip PDF is only available in the browser.");
}

export async function downloadOrdersPdf(_orders: PackingSlipOrder[]) {
  throw new Error("Packing slip PDF is only available in the browser.");
}
