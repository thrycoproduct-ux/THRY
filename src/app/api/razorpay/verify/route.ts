import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import db from "@/lib/supabase/db";
import { orders } from "@/lib/supabase/schema";
import { getRazorpayConfig } from "@/lib/integrations/settings";
import { verifyRazorpayCheckoutSignature } from "@/lib/payments/razorpay";
import { razorpayVerifyBodySchema } from "@/lib/payments/razorpay-standards";
import { syncRazorpayOrderPayment } from "@/lib/payments/orderPaymentSync";
import {
  canViewOrder,
  resolvePaymentReturnPath,
} from "@/lib/auth/order-access";
import { publicErrorMessage } from "@/lib/api/public-error";
import { withRetry } from "@/lib/resilience";

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  const parsed = razorpayVerifyBodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid Razorpay verification payload." },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const config = await getRazorpayConfig();
  if (!config) {
    return NextResponse.json(
      { message: "Razorpay is not configured." },
      { status: 503 },
    );
  }

  const validSignature = verifyRazorpayCheckoutSignature({
    razorpayOrderId: body.razorpay_order_id,
    razorpayPaymentId: body.razorpay_payment_id,
    razorpaySignature: body.razorpay_signature,
    keySecret: config.keySecret,
  });

  if (!validSignature) {
    return NextResponse.json(
      { message: "Invalid Razorpay payment signature." },
      { status: 401 },
    );
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, body.orderId),
  });
  if (!order) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }

  const allowed = await canViewOrder(order, body.accessToken);
  if (!allowed) {
    return NextResponse.json(
      { message: "Invalid order access token." },
      { status: 403 },
    );
  }

  try {
    const result = await withRetry(
      () =>
        syncRazorpayOrderPayment(
          {
            orderId: order.id,
            razorpayOrderId: body.razorpay_order_id,
            razorpayPaymentId: body.razorpay_payment_id,
          },
          { runSideEffects: false, treatAsPaid: true },
        ),
      { label: "razorpay:verify-sync", attempts: 3 },
    );

    const redirectPath = resolvePaymentReturnPath({
      orderId: order.id,
      createdAt: order.createdAt,
      token: body.accessToken,
    });

    if (!result.isPaid) {
      return NextResponse.json(
        {
          ok: false,
          isPaid: false,
          message:
            "Payment signature is valid, but this order is held for review (amount mismatch or gateway status). Contact support with your order id.",
          redirect: redirectPath,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      isPaid: true,
      redirect: redirectPath,
    });
  } catch (error) {
    console.error("[razorpay] verify failed:", error);
    return NextResponse.json(
      {
        message: publicErrorMessage(
          error,
          "Could not confirm Razorpay payment. Please retry.",
        ),
      },
      { status: 500 },
    );
  }
}
