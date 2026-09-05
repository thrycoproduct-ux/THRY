import {
  buildOrderConfirmationHtml,
  buildOrderConfirmationPlainText,
  buildOrderConfirmationSubject,
  formatBreakdownLineValue,
  type OrderConfirmationEmailInput,
} from "./order-confirmation-content";

describe("order confirmation email content", () => {
  const baseInput: OrderConfirmationEmailInput = {
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
    paymentMethod: "Razorpay · UPI",
    customerPhone: "+91 9876543210",
    lineItems: [
      {
        name: "Mandala Kit",
        quantity: 1,
        unitPrice: 1000,
        imageUrl: "https://thryco.com/images/products/mandala.jpg",
        imageAlt: "Mandala Kit",
        productCode: "MK-001",
      },
    ],
    shippingAddress: {
      line1: "12 MG Road",
      line2: null,
      city: "Hosur",
      state: "Tamil Nadu",
      postalCode: "635126",
      country: "India",
    },
    orderUrl: "https://thryco.com/orders/ord_test123?token=abc",
  };

  it("builds a subject with order id", () => {
    expect(buildOrderConfirmationSubject("ord_test123")).toBe(
      "Order confirmed — #ord_test123 · THRY",
    );
  });

  it("formats breakdown values", () => {
    expect(
      formatBreakdownLineValue({
        key: "courier",
        label: "Courier",
        valueKind: "free",
        amount: 0,
      }),
    ).toBe("Free");
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
    expect(text).toContain("Payment: Razorpay · UPI");
    expect(text).toContain("Phone: +91 9876543210");
    expect(text).toContain("Mandala Kit (MK-001) × 1");
    expect(text).toContain("Subtotal");
    expect(text).toContain("Courier");
    expect(text).not.toContain("GST");
    expect(text).toContain("12 MG Road");
    expect(text).toContain("PIN: 635126");
    expect(text).toContain(baseInput.orderUrl);
  });

  it("renders product images and payment details in html", () => {
    const html = buildOrderConfirmationHtml(baseInput);

    expect(html).toContain("Order confirmed");
    expect(html).toContain("mandala.jpg");
    expect(html).toContain("MK-001");
    expect(html).toContain("Razorpay · UPI");
    expect(html).toContain("View order");
  });
});
