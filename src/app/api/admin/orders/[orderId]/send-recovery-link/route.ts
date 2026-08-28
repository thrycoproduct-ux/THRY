import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSessionUser, isAdminUser } from "@/lib/auth/admin";
import { publicErrorMessage } from "@/lib/api/public-error";
import db from "@/lib/supabase/db";
import { orders } from "@/lib/supabase/schema";
import { mergePaymentMeta, readPaymentMeta } from "@/lib/orders/payment-meta";
import { createRazorpayPaymentLink } from "@/lib/payments/razorpay-payment-links";
import { sendAbandonedCartWhatsApp } from "@/lib/payments/abandoned-cart-whatsapp";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser();
  const admin = await isAdminUser(user);
  if (!user || !admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });

  if (!order) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }

  if (order.payment_status === "paid") {
    return NextResponse.json(
      { message: "Order is already paid." },
      { status: 400 },
    );
  }

  const amount = Number(order.amount);
  if (!amount || amount <= 0) {
    return NextResponse.json(
      { message: "Order has invalid amount." },
      { status: 400 },
    );
  }

  try {
    const paymentLink = await createRazorpayPaymentLink({
      orderId: order.id,
      amountInRupees: amount,
      customerName: order.name,
      customerMobile: order.customer_mobile,
      customerEmail: order.email,
      expireInMinutes: 60 * 48,
      notifySms: false,
      notifyEmail: false,
      createdAt: order.createdAt,
    });

    if (!paymentLink?.short_url) {
      throw new Error("Razorpay did not return a payment link URL.");
    }

    const meta = readPaymentMeta(order.payment_meta);
    await db
      .update(orders)
      .set({
        payment_meta: mergePaymentMeta(meta, {
          recoveryLinkSent: true,
          recoveryLinkSentAt: new Date().toISOString(),
          recoveryLinkId: paymentLink.id,
          recoveryLinkUrl: paymentLink.short_url,
          recoveryLinkSentBy: user.id,
        }),
      })
      .where(eq(orders.id, order.id));

    let whatsappSent = false;
    if (order.customer_mobile) {
      const waResult = await sendAbandonedCartWhatsApp({
        mobile: order.customer_mobile,
        customerName: order.name,
        orderId: order.id,
        amount: String(amount),
        paymentLink: paymentLink.short_url,
      });
      whatsappSent = waResult.sent;
    }

    return NextResponse.json({
      ok: true,
      paymentLinkUrl: paymentLink.short_url,
      paymentLinkId: paymentLink.id,
      whatsappSent,
    });
  } catch (error) {
    console.error("[admin] send-recovery-link failed:", error);
    return NextResponse.json(
      {
        ok: false,
        message: publicErrorMessage(
          error,
          "Could not create payment link. Check Razorpay configuration.",
        ),
      },
      { status: 500 },
    );
  }
}
