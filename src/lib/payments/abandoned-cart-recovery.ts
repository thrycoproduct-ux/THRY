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
 * that need a recovery payment link and/or WhatsApp nudge.
 */
export async function recoverAbandonedCarts(options?: {
  minAgeMinutes?: number;
  maxAgeHours?: number;
  limit?: number;
}): Promise<AbandonedCartRecoveryResult> {
  const minAge = options?.minAgeMinutes ?? 15;
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
      sql`coalesce(${orders.customer_mobile}, '') <> ''`,
      // Need a new link, or an existing link whose WhatsApp send failed.
      sql`(
        coalesce((${orders.payment_meta}->>'recoveryLinkSent')::boolean, false) = false
        OR (
          coalesce((${orders.payment_meta}->>'recoveryWhatsAppSent')::boolean, false) = false
          AND coalesce(${orders.payment_meta}->>'recoveryLinkUrl', '') <> ''
        )
      )`,
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
      if (meta.recoveryWhatsAppSent) continue;

      const amount = Number(order.amount);
      if (!amount || amount <= 0) continue;

      let paymentLinkUrl = String(meta.recoveryLinkUrl ?? "").trim();
      let paymentLinkId = String(meta.recoveryLinkId ?? "").trim();

      if (!paymentLinkUrl) {
        const paymentLink = await createRazorpayPaymentLink({
          orderId: order.id,
          amountInRupees: amount,
          customerName: order.name,
          customerMobile: order.customer_mobile,
          customerEmail: order.email,
          description: `Complete your ${siteConfig.name} order`,
          expireInMinutes: 60 * 23,
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

        paymentLinkUrl = paymentLink.short_url;
        paymentLinkId = paymentLink.id;
        result.linksSent += 1;

        await db
          .update(orders)
          .set({
            payment_meta: mergePaymentMeta(meta, {
              recoveryLinkSent: true,
              recoveryLinkSentAt: new Date().toISOString(),
              recoveryLinkId: paymentLinkId,
              recoveryLinkUrl: paymentLinkUrl,
              recoveryWhatsAppSent: false,
            }),
          })
          .where(eq(orders.id, order.id));
      }

      if (!order.customer_mobile) {
        result.errors.push({
          orderId: order.id,
          message: "Missing customer mobile for WhatsApp recovery",
        });
        continue;
      }

      const waResult = await sendAbandonedCartWhatsApp({
        mobile: order.customer_mobile,
        customerName: order.name,
        orderId: order.id,
        amount: String(amount),
        paymentLink: paymentLinkUrl,
      });

      const latestMeta = readPaymentMeta(
        (
          await db.query.orders.findFirst({
            where: eq(orders.id, order.id),
            columns: { payment_meta: true },
          })
        )?.payment_meta ?? meta,
      );

      if (waResult.sent) {
        result.whatsappSent += 1;
        await db
          .update(orders)
          .set({
            payment_meta: mergePaymentMeta(latestMeta, {
              recoveryLinkSent: true,
              recoveryLinkId: paymentLinkId || latestMeta.recoveryLinkId,
              recoveryLinkUrl: paymentLinkUrl,
              recoveryWhatsAppSent: true,
              recoveryWhatsAppSentAt: new Date().toISOString(),
            }),
          })
          .where(eq(orders.id, order.id));
        result.recovered += 1;
      } else {
        const waReason = waResult.reason ?? "whatsapp_failed";
        await db
          .update(orders)
          .set({
            payment_meta: mergePaymentMeta(latestMeta, {
              recoveryLinkSent: true,
              recoveryLinkId: paymentLinkId || latestMeta.recoveryLinkId,
              recoveryLinkUrl: paymentLinkUrl,
              recoveryWhatsAppSent: false,
              recoveryWhatsAppLastError: waReason.slice(0, 300),
              recoveryWhatsAppLastAttemptAt: new Date().toISOString(),
            }),
          })
          .where(eq(orders.id, order.id));
        result.errors.push({
          orderId: order.id,
          message: `WhatsApp not sent: ${waReason}`,
        });
      }
    } catch (error) {
      result.errors.push({
        orderId: order.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
