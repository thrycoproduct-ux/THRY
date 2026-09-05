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
    const meta = readPaymentMeta(order.payment_meta);
    const existingUrl = String(meta.recoveryLinkUrl ?? "").trim();

    let paymentLinkUrl = existingUrl;
    let paymentLinkId = String(meta.recoveryLinkId ?? "").trim();

    if (!paymentLinkUrl) {
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

      paymentLinkUrl = paymentLink.short_url;
      paymentLinkId = paymentLink.id;
    }

    await db
      .update(orders)
      .set({
        payment_meta: mergePaymentMeta(meta, {
          recoveryLinkSent: true,
          recoveryLinkSentAt: new Date().toISOString(),
          recoveryLinkId: paymentLinkId || meta.recoveryLinkId,
          recoveryLinkUrl: paymentLinkUrl,
          recoveryLinkSentBy: user.id,
          recoveryWhatsAppSent: false,
        }),
      })
      .where(eq(orders.id, order.id));

    let whatsappSent = false;
    let whatsappReason: string | null = null;
    if (order.customer_mobile) {
      const waResult = await sendAbandonedCartWhatsApp({
        mobile: order.customer_mobile,
        customerName: order.name,
        orderId: order.id,
        amount: String(amount),
        paymentLink: paymentLinkUrl,
      });
      if (waResult.sent) {
        whatsappSent = true;
        const latest = readPaymentMeta(
          (
            await db.query.orders.findFirst({
              where: eq(orders.id, order.id),
              columns: { payment_meta: true },
            })
          )?.payment_meta,
        );
        await db
          .update(orders)
          .set({
            payment_meta: mergePaymentMeta(latest, {
              recoveryWhatsAppSent: true,
              recoveryWhatsAppSentAt: new Date().toISOString(),
            }),
          })
          .where(eq(orders.id, order.id));
      } else {
        whatsappReason = waResult.reason ?? "whatsapp_failed";
      }
    }

    return NextResponse.json({
      ok: true,
      paymentLinkUrl,
      paymentLinkId: paymentLinkId || null,
      whatsappSent,
      whatsappReason,
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
