import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import db from "@/lib/supabase/db";
import { orders } from "@/lib/supabase/schema";
import { canViewOrder } from "@/lib/auth/order-access";

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("orderId")?.trim();
  const token = request.nextUrl.searchParams.get("token")?.trim() || undefined;

  if (!orderId) {
    return NextResponse.json({ isPaid: false }, { status: 400 });
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: {
      id: true,
      payment_status: true,
      createdAt: true,
      user_id: true,
    },
  });

  if (!order) {
    return NextResponse.json({ isPaid: false }, { status: 404 });
  }

  const allowed = await canViewOrder(order, token);
  if (!allowed) {
    return NextResponse.json({ isPaid: false }, { status: 403 });
  }

  const isPaid = ["paid", "success", "captured"].includes(
    order.payment_status?.toLowerCase() ?? "",
  );

  return NextResponse.json({ isPaid });
}
