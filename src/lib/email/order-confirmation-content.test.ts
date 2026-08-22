import {
  buildOrderConfirmationPlainText,
  buildOrderConfirmationSubject,
  formatBreakdownLineValue,
} from "./order-confirmation-content";

describe("order confirmation email content", () => {
  const baseInput = {
    orderId: "ord_test123",
    customerName: "Sanjay",
    customerEmail: "buyer@example.com",
    orderAmount: 1180,
    currency: "INR",
    createdAt: "2026-01-15T10:30:00.000Z",
    paymentMeta: {
      subtotalAmount: 1000,
      courierCharge: 0,
      courierRule: "free_shipping",
      gstAmount: 180,
      gstEnabled: true,
      gstPercentage: 18,
    },
    lineItems: [{ name: "Mandala Kit", quantity: 1, unitPrice: 1000 }],
    shippingAddress: {
      line1: "12 MG Road",
      line2: null,
      city: "Hosur",
      state: "Tamil Nadu",
      postalCode: "635126",
      country: "India",
    },
    orderUrl: "https://thryco.com/orders/ord_test123?token=abc",
  } as const;

  it("builds a subject with order id", () => {
    expect(buildOrderConfirmationSubject("ord_test123")).toBe(
      "Order confirmed — #ord_test123 · THRY",
    );
  });

  it("formats breakdown values", () => {
    expect(formatBreakdownLineValue({ key: "courier", label: "Courier", valueKind: "free", amount: 0 })).toBe(
      "Free",
    );
    expect(
      formatBreakdownLineValue({
        key: "gst",
        label: "GST",
        valueKind: "not_applied",
        amount: 0,
      }),
    ).toBe("Not applied");
  });

  it("includes items, summary, address, and order link in plain text", () => {
    const text = buildOrderConfirmationPlainText(baseInput);

    expect(text).toContain("Hi Sanjay");
    expect(text).toContain("Order #ord_test123");
    expect(text).toContain("Mandala Kit × 1");
    expect(text).toContain("GST (18%)");
    expect(text).toContain("12 MG Road");
    expect(text).toContain("PIN: 635126");
    expect(text).toContain(baseInput.orderUrl);
  });
});
