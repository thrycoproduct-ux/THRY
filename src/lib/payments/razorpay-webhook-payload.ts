export const RAZORPAY_HANDLED_WEBHOOK_EVENTS = [
  "payment.captured",
  "payment.authorized",
  "order.paid",
  "payment.failed",
  "payment_link.paid",
] as const;

export type RazorpayHandledWebhookEvent =
  (typeof RAZORPAY_HANDLED_WEBHOOK_EVENTS)[number];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export type RazorpayWebhookIds = {
  event: string;
  razorpayPaymentId: string;
  razorpayOrderId: string;
  shopOrderId: string;
  skipped: boolean;
};

export function resolveRazorpayWebhookIds(body: unknown): RazorpayWebhookIds {
  const record = asRecord(body) ?? {};
  const event = String(record.event ?? "").trim();
  const payload = asRecord(record.payload);
  const paymentEntity = asRecord(asRecord(payload?.payment)?.entity);
  const orderEntity = asRecord(asRecord(payload?.order)?.entity);
  const paymentLinkEntity = asRecord(asRecord(payload?.payment_link)?.entity);

  const razorpayPaymentId = String(paymentEntity?.id ?? "").trim();
  const razorpayOrderId = String(
    paymentEntity?.order_id ?? orderEntity?.id ?? "",
  ).trim();
  const notes =
    asRecord(paymentEntity?.notes) ??
    asRecord(orderEntity?.notes) ??
    asRecord(paymentLinkEntity?.notes);
  const shopOrderId = String(
    notes?.shop_order_id ??
      orderEntity?.receipt ??
      paymentLinkEntity?.reference_id ??
      "",
  ).trim();

  const handled =
    !event ||
    (RAZORPAY_HANDLED_WEBHOOK_EVENTS as readonly string[]).includes(event);

  return {
    event,
    razorpayPaymentId,
    razorpayOrderId,
    shopOrderId,
    skipped: !handled,
  };
}
