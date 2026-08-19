import db from "@/lib/supabase/db";
import { dispatchCouriers, orderDispatchEvents } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import { resolveCourierTrackingUrl } from "./courier-tracking-url";

export type OrderDispatchInfo = {
  id: string;
  courierId: string | null;
  courierName: string;
  trackingNumber: string | null;
  dispatchedAt: string;
  trackingUrl: string | null;
  trackingUrlTemplate: string | null;
};

/** Load the active dispatch record for an order (at most one per order). */
export async function getOrderDispatchInfo(
  orderId: string,
): Promise<OrderDispatchInfo | null> {
  const rows = await db
    .select({
      id: orderDispatchEvents.id,
      courierId: orderDispatchEvents.courierId,
      courierName: orderDispatchEvents.courierName,
      trackingNumber: orderDispatchEvents.trackingNumber,
      dispatchedAt: orderDispatchEvents.dispatchedAt,
      trackingUrlTemplate: orderDispatchEvents.trackingUrlTemplate,
      liveTemplate: dispatchCouriers.trackingUrlTemplate,
    })
    .from(orderDispatchEvents)
    .leftJoin(
      dispatchCouriers,
      eq(orderDispatchEvents.courierId, dispatchCouriers.id),
    )
    .where(eq(orderDispatchEvents.orderId, orderId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const dispatchedAt = new Date(row.dispatchedAt).toISOString();
  const trackingUrl = resolveCourierTrackingUrl({
    trackingNumber: row.trackingNumber,
    templateSnapshot: row.trackingUrlTemplate,
    templateFallback: row.liveTemplate,
  });

  return {
    id: row.id,
    courierId: row.courierId,
    courierName: row.courierName,
    trackingNumber: row.trackingNumber,
    dispatchedAt,
    trackingUrl,
    trackingUrlTemplate: row.trackingUrlTemplate ?? row.liveTemplate ?? null,
  };
}
