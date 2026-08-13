import { buildOrderPlacedAtPayload } from "@/lib/datetime/india";

export const DEFAULT_VELO_ORDER_PUSH_URL =
  "";

export type VeloOrderPushPayload = {
  shopBaseUrl: string;
  orderId: string;
  customerName: string;
  quantity: number;
  /** ISO-8601 UTC instant when the order was created. */
  placedAt: string | null;
  /** Human-readable Asia/Kolkata time for Velo UI / notifications. */
  placedAtIst: string | null;
  timeZone: "Asia/Kolkata";
};

export function buildVeloOrderPushPayload(input: {
  shopBaseUrl: string;
  orderId: string;
  customerName?: string | null;
  lineQuantities: number[];
  createdAt?: Date | string | null;
}): VeloOrderPushPayload {
  const quantity = Math.max(
    1,
    input.lineQuantities.reduce(
      (sum, qty) => sum + (Number.isFinite(qty) && qty > 0 ? qty : 0),
      0,
    ),
  );

  const customerName = String(input.customerName ?? "").trim() || "Guest";
  const placed = buildOrderPlacedAtPayload(input.createdAt ?? null);

  return {
    shopBaseUrl: input.shopBaseUrl.replace(/\/$/, ""),
    orderId: input.orderId,
    customerName,
    quantity,
    placedAt: placed.placedAt,
    placedAtIst: placed.placedAtIst,
    timeZone: placed.timeZone,
  };
}
