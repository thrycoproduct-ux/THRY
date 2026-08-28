import { and, eq, gte, lt, sql } from "drizzle-orm";
import db from "@/lib/supabase/db";
import { orders } from "@/lib/supabase/schema";
import { mergePaymentMeta, readPaymentMeta } from "@/lib/orders/payment-meta";
import { createRazorpayPaymentLink } from "@/lib/payments/razorpay-payment-links";
import { sendAbandonedCartWhatsApp } from "@/lib/payments/abandoned-cart-whatsapp";
import { siteConfig } from "@/config/site";

export type AbandonedCartRecoveryResult = {
  scanned: number;
  recovered: number;
  linksSent: number;
  whatsappSent: number;
  errors: Array<{ orderId: string; message: string }>;
};

/**
 * Find unpaid orders older than `minAgeMinutes` but younger than `maxAgeHours`
 * that haven't already been sent a recovery link. Generate a Razorpay Payment
 * Link and send it via WhatsApp.
 */
export async function recoverAbandonedCarts(options?: {
  minAgeMinutes?: number;
  maxAgeHours?: number;
  limit?: number;
}): Promise<AbandonedCartRecoveryResult> {
  const minAge = options?.minAgeMinutes ?? 20;
  const maxAge = options?.maxAgeHours ?? 24;
  const limit = Math.min(options?.limit ?? 20, 50);

  const now = new Date();
  const oldestAllowed = new Date(now.getTime() - maxAge * 60 * 60 * 1000);
  const newestAllowed = new Date(now.getTime() - minAge * 60 * 1000);

  const candidates = await db.query.orders.findMany({
    where: and(
      eq(orders.payment_status, "unpaid"),
      eq(orders.order_status, "pending"),
      gte(orders.createdAt, oldestAllowed),
      lt(orders.createdAt, newestAllowed),
      sql`coalesce((${orders.payment_meta}->>'recoveryLinkSent')::boolean, false) = false`,
      sql`coalesce(${orders.customer_mobile}, '') <> ''`,
    ),
    orderBy: (o, { desc }) => [desc(o.createdAt)],
    limit,
  });

  const result: AbandonedCartRecoveryResult = {
    scanned: candidates.length,
    recovered: 0,
    linksSent: 0,
    whatsappSent: 0,
    errors: [],
  };

  for (const order of candidates) {
    try {
      const meta = readPaymentMeta(order.payment_meta);
      if (meta.recoveryLinkSent) continue;

      const amount = Number(order.amount);
      if (!amount || amount <= 0) continue;

      const paymentLink = await createRazorpayPaymentLink({
        orderId: order.id,
        amountInRupees: amount,
        customerName: order.name,
        customerMobile: order.customer_mobile,
        customerEmail: order.email,
        description: `Complete your ${siteConfig.name} order`,
        expireInMinutes: 60 * 23, // 23 hours
        notifySms: false,
        notifyEmail: false,
        createdAt: order.createdAt,
      });

      if (!paymentLink?.short_url) {
        result.errors.push({
          orderId: order.id,
          message: "Payment link creation returned no URL",
        });
        continue;
      }

      result.linksSent += 1;

      await db
        .update(orders)
        .set({
          payment_meta: mergePaymentMeta(meta, {
            recoveryLinkSent: true,
            recoveryLinkSentAt: new Date().toISOString(),
            recoveryLinkId: paymentLink.id,
            recoveryLinkUrl: paymentLink.short_url,
          }),
        })
        .where(eq(orders.id, order.id));

      if (order.customer_mobile) {
        const waResult = await sendAbandonedCartWhatsApp({
          mobile: order.customer_mobile,
          customerName: order.name,
          orderId: order.id,
          amount: String(amount),
          paymentLink: paymentLink.short_url,
        });

        if (waResult.sent) {
          result.whatsappSent += 1;
        }
      }

      result.recovered += 1;
    } catch (error) {
      result.errors.push({
        orderId: order.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
