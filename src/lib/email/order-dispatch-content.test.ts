import {
  buildOrderDispatchHtml,
  buildOrderDispatchPlainText,
  buildOrderDispatchSubject,
  type OrderDispatchEmailInput,
} from "./order-dispatch-content";

describe("order dispatch email content", () => {
  const baseInput: OrderDispatchEmailInput = {
    orderId: "ord_dispatch1",
    customerName: "Sanjay",
    customerEmail: "buyer@example.com",
    createdAt: "2026-01-15T10:30:00.000Z",
    customerPhone: "+91 9876543210",
    lineItems: [
      {
        name: "Mandala Kit",
        quantity: 2,
        unitPrice: 500,
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
    orderUrl: "https://thryco.com/orders/ord_dispatch1?token=abc",
    courierName: "Delhivery",
    trackingNumber: "DL123456789",
    trackingUrl: "https://www.delhivery.com/track/package/DL123456789",
    dispatchedAt: "2026-01-16T08:00:00.000Z",
  };

  it("builds a subject with order id", () => {
    expect(buildOrderDispatchSubject("ord_dispatch1")).toBe(
      "Your order has shipped — #ord_dispatch1 · THRY",
    );
  });

  it("includes courier, tracking, items, and address in plain text", () => {
    const text = buildOrderDispatchPlainText(baseInput);

    expect(text).toContain("Hi Sanjay");
    expect(text).toContain("Order #ord_dispatch1");
    expect(text).toContain("Courier: Delhivery");
    expect(text).toContain("Tracking number: DL123456789");
    expect(text).toContain("Track package:");
    expect(text).toContain("Mandala Kit (MK-001) × 2");
    expect(text).toContain("12 MG Road");
    expect(text).toContain("PIN: 635126");
    expect(text).toContain(baseInput.orderUrl);
  });

  it("renders product images and tracking link in html", () => {
    const html = buildOrderDispatchHtml(baseInput);

    expect(html).toContain("Order dispatched");
    expect(html).toContain("mandala.jpg");
    expect(html).toContain("MK-001");
    expect(html).toContain("Track package");
    expect(html).toContain("Delhivery");
    expect(html).toContain("DL123456789");
  });
});
