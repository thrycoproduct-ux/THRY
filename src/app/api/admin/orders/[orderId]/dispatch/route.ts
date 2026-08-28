import { getSessionUser, isAdminUser } from "@/lib/auth/admin";
import {
  publicValidationPayload,
  logServerError,
} from "@/lib/api/public-error";
import { sanitizeTrackingNumber } from "@/lib/dispatch/tracking-sanitizer";
import { resolveCourierTrackingUrl } from "@/lib/dispatch/courier-tracking-url";
import {
  DispatchConflictError,
  mapDispatchPersistenceError,
} from "@/lib/dispatch/dispatch-errors";
import {
  persistOrderDispatch,
  resolveDispatchCreatedBy,
} from "@/lib/dispatch/persist-order-dispatch";
import { notifyOrderDispatchEmail } from "@/lib/email/order-dispatch-email";
import db, { withDbAsync } from "@/lib/supabase/db";
import { dispatchCouriers, orders } from "@/lib/supabase/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const dispatchPayloadSchema = z.object({
  courierId: z.string().trim().min(1),
  trackingNumber: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
});

async function ensureAdmin() {
  const user = await getSessionUser();
  const admin = await isAdminUser(user);
  if (!user || !admin) return null;
  return user;
}

function normalizeOrderStatus(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

function normalizePaymentStatus(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const user = await ensureAdmin();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;
  const parsedBody = dispatchPayloadSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsedBody.success) {
    const parseError = parsedBody as z.SafeParseError<
      z.infer<typeof dispatchPayloadSchema>
    >;
    return NextResponse.json(
      publicValidationPayload("Invalid dispatch payload", parseError.error),
      { status: 400 },
    );
  }

  return withDbAsync(async () => {
  const courierId = parsedBody.data.courierId;

  // Validate courier exists + active.
  const courier = await db.query.dispatchCouriers.findFirst({
    where: and(
      eq(dispatchCouriers.id, courierId),
      eq(dispatchCouriers.isActive, true),
    ),
  });
  if (!courier) {
    return NextResponse.json(
      { message: "Courier not found or inactive" },
      { status: 400 },
    );
  }

  // Tracking is optional, but if supplied it must be valid.
  let trackingNumber: string | null = null;
  if (parsedBody.data.trackingNumber != null) {
    try {
      trackingNumber = sanitizeTrackingNumber(parsedBody.data.trackingNumber);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Invalid tracking number.";
      return NextResponse.json({ message }, { status: 400 });
    }
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: {
      id: true,
      order_status: true,
      payment_status: true,
    },
  });
  if (!order) {
    return NextResponse.json({ message: "Order not found" }, { status: 404 });
  }

  const orderStatusNorm = normalizeOrderStatus(order.order_status);
  const paymentStatusNorm = normalizePaymentStatus(order.payment_status);

  const isPaid =
    paymentStatusNorm === "paid" ||
    paymentStatusNorm === "success" ||
    paymentStatusNorm === "captured";

  if (!isPaid) {
    return NextResponse.json(
      { message: "Only paid orders can be dispatched" },
      { status: 409 },
    );
  }

  if (orderStatusNorm !== "preparing") {
    return NextResponse.json(
      {
        message: `Dispatch not allowed. Order is '${order.order_status}' (expected PREPARING).`,
      },
      { status: 409 },
    );
  }

  let dispatchEventId = "";
  let dispatchedAtIso = "";
  try {
    const createdBy = await resolveDispatchCreatedBy(user.id);
    const persisted = await persistOrderDispatch({
      orderId,
      courier,
      trackingNumber,
      createdBy,
    });
    dispatchEventId = persisted.dispatchEventId;
    dispatchedAtIso = persisted.dispatchedAtIso;
  } catch (error) {
    const mapped = mapDispatchPersistenceError(error);
    if (mapped instanceof DispatchConflictError) {
      return NextResponse.json({ message: mapped.message }, { status: 409 });
    }

    logServerError("admin/orders/[orderId]/dispatch POST", error);
    return NextResponse.json(
      { message: mapped.message || "Dispatch failed. Please retry." },
      { status: 500 },
    );
  }

  const trackingUrl = resolveCourierTrackingUrl({
    trackingNumber,
    templateSnapshot: courier.trackingUrlTemplate,
  });

  const fullOrder = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });

  if (fullOrder) {
    try {
      await notifyOrderDispatchEmail(fullOrder, {
        courierName: courier.name,
        trackingNumber,
        trackingUrl,
        dispatchedAt: dispatchedAtIso,
      });
    } catch (error) {
      logServerError("admin/orders/[orderId]/dispatch email", error);
    }
  }

  return NextResponse.json({
    ok: true,
    orderId,
    orderStatus: "DISPATCHED",
    dispatchEventId,
    courier: { id: courier.id, name: courier.name },
    trackingNumber,
    trackingUrl,
    dispatchedAt: dispatchedAtIso,
  });
  });
}
