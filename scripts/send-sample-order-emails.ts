/**
 * Send sample confirmation + dispatch emails to validate templates end-to-end.
 * Usage: npx tsx --env-file=.env.local scripts/send-sample-order-emails.ts
 */
import { Resend } from "resend";
import {
  buildOrderConfirmationHtml,
  buildOrderConfirmationPlainText,
  buildOrderConfirmationSubject,
} from "@/lib/email/order-confirmation-content";
import {
  buildOrderDispatchHtml,
  buildOrderDispatchPlainText,
  buildOrderDispatchSubject,
} from "@/lib/email/order-dispatch-content";

const to = process.env.SAMPLE_EMAIL_TO?.trim() || "thrycoproduct@gmail.com";
const from =
  process.env.RESEND_FROM_EMAIL?.trim() || "THRY <orders@thryco.com>";
const apiKey = process.env.RESEND_API_KEY?.trim();
if (!apiKey) {
  console.error("RESEND_API_KEY missing");
  process.exit(1);
}

const lineItems = [
  {
    name: "Mandala Art Kit",
    quantity: 2,
    unitPrice: 499,
    imageUrl: "https://thryco.com/images/thry-wordmark.svg",
    imageAlt: "Mandala Art Kit",
    productCode: "MK-001",
  },
];

const base = {
  orderId: "ord_sample123",
  customerName: "Sanjay",
  customerEmail: to,
  createdAt: new Date().toISOString(),
  customerPhone: "+91 9876543210",
  lineItems,
  shippingAddress: {
    line1: "12 MG Road",
    line2: null,
    city: "Hosur",
    state: "Tamil Nadu",
    postalCode: "635126",
    country: "India",
  },
  orderUrl: "https://thryco.com/orders/ord_sample123?token=sample",
};

const resend = new Resend(apiKey);

async function main() {
  const confirmation = await resend.emails.send({
    from,
    to,
    subject: buildOrderConfirmationSubject(base.orderId),
    html: buildOrderConfirmationHtml({
      ...base,
      orderAmount: 1178,
      currency: "INR",
      paymentMeta: {
        subtotalAmount: 998,
        courierCharge: 0,
        courierRule: "free_shipping",
        gstAmount: 180,
        gstEnabled: true,
        gstPercentage: 18,
      },
      paymentMethod: "Razorpay · UPI",
    }),
    text: buildOrderConfirmationPlainText({
      ...base,
      orderAmount: 1178,
      currency: "INR",
      paymentMeta: {
        subtotalAmount: 998,
        courierCharge: 0,
        courierRule: "free_shipping",
        gstAmount: 180,
        gstEnabled: true,
        gstPercentage: 18,
      },
      paymentMethod: "Razorpay · UPI",
    }),
    replyTo: "thrycoproduct@gmail.com",
  });

  const dispatch = await resend.emails.send({
    from,
    to,
    subject: buildOrderDispatchSubject(base.orderId),
    html: buildOrderDispatchHtml({
      ...base,
      courierName: "Delhivery",
      trackingNumber: "DL123456789IN",
      trackingUrl: "https://www.delhivery.com/track/package/DL123456789IN",
      dispatchedAt: new Date().toISOString(),
    }),
    text: buildOrderDispatchPlainText({
      ...base,
      courierName: "Delhivery",
      trackingNumber: "DL123456789IN",
      trackingUrl: "https://www.delhivery.com/track/package/DL123456789IN",
      dispatchedAt: new Date().toISOString(),
    }),
    replyTo: "thrycoproduct@gmail.com",
  });

  console.log(
    JSON.stringify(
      {
        to,
        confirmation: confirmation.error ?? confirmation.data?.id,
        dispatch: dispatch.error ?? dispatch.data?.id,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
