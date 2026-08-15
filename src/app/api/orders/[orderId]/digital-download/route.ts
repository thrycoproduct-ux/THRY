import { canViewOrder } from "@/lib/auth/order-access";
import { checkCheckoutRateLimit, getRequestIp } from "@/lib/auth/rate-limit";
import {
  DIGITAL_DOWNLOAD_URL_TTL_SEC,
  canDownloadPaidDigital,
} from "@/lib/products/digital-product";
import { createPresignedGetUrl } from "@/lib/s3";
import db from "@/lib/supabase/db";
import { orderLines, orders } from "@/lib/supabase/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const limited = await checkCheckoutRateLimit(getRequestIp(request.headers), {
    limit: 20,
    windowSec: 60,
  });
  if (limited.limited) {
    return NextResponse.json(
      { message: "Too many download attempts. Please wait a minute." },
      { status: 429 },
    );
  }

  const { orderId } = await context.params;
  const lineId = request.nextUrl.searchParams.get("lineId")?.trim();
  const token = request.nextUrl.searchParams.get("token");

  if (!orderId || !lineId) {
    return NextResponse.json({ message: "Missing download details." }, { status: 400 });
  }

  const [order] = await db
    .select({
      id: orders.id,
      user_id: orders.user_id,
      createdAt: orders.createdAt,
      paymentStatus: orders.payment_status,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }

  const allowed = await canViewOrder(
    {
      id: order.id,
      user_id: order.user_id,
      createdAt: order.createdAt,
    },
    token,
  );
  if (!allowed) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const [line] = await db
    .select({
      id: orderLines.id,
      isDigitalSnapshot: orderLines.isDigitalSnapshot,
      digitalFileKeySnapshot: orderLines.digitalFileKeySnapshot,
      digitalFileNameSnapshot: orderLines.digitalFileNameSnapshot,
    })
    .from(orderLines)
    .where(and(eq(orderLines.id, lineId), eq(orderLines.orderId, orderId)))
    .limit(1);

  if (!line) {
    return NextResponse.json({ message: "Item not found." }, { status: 404 });
  }

  const gate = canDownloadPaidDigital({
    paymentStatus: order.paymentStatus,
    isDigital: Boolean(line.isDigitalSnapshot),
    fileKey: line.digitalFileKeySnapshot,
  });
  if (!gate.ok) {
    return NextResponse.json({ message: gate.message }, { status: 403 });
  }

  const downloadUrl = await createPresignedGetUrl({
    key: String(line.digitalFileKeySnapshot),
    expiresInSeconds: DIGITAL_DOWNLOAD_URL_TTL_SEC,
    fileName: line.digitalFileNameSnapshot || "download.zip",
  });

  return NextResponse.redirect(downloadUrl, { status: 302 });
}
