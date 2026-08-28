import { resolveRazorpayWebhookIds } from "./razorpay-webhook-payload";

describe("resolveRazorpayWebhookIds", () => {
  it("reads shop order id from payment notes on payment.captured", () => {
    const ids = resolveRazorpayWebhookIds({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_abc",
            order_id: "order_xyz",
            notes: { shop_order_id: "ord_thry_1" },
          },
        },
      },
    });

    expect(ids).toMatchObject({
      skipped: false,
      razorpayPaymentId: "pay_abc",
      razorpayOrderId: "order_xyz",
      shopOrderId: "ord_thry_1",
    });
  });

  it("reads shop order id from payment_link notes when order_id is missing", () => {
    const ids = resolveRazorpayWebhookIds({
      event: "payment_link.paid",
      payload: {
        payment: {
          entity: {
            id: "pay_linkpay",
            notes: { shop_order_id: "ord_thry_2" },
          },
        },
        payment_link: {
          entity: {
            id: "plink_1",
            reference_id: "ord_thry_2",
            notes: { shop_order_id: "ord_thry_2" },
          },
        },
      },
    });

    expect(ids.skipped).toBe(false);
    expect(ids.shopOrderId).toBe("ord_thry_2");
    expect(ids.razorpayPaymentId).toBe("pay_linkpay");
    expect(ids.razorpayOrderId).toBe("");
  });

  it("skips unrelated events", () => {
    const ids = resolveRazorpayWebhookIds({
      event: "refund.created",
      payload: {},
    });
    expect(ids.skipped).toBe(true);
  });
});
