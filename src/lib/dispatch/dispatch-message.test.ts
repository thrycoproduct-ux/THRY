import { buildDispatchNotificationText } from "./dispatch-message";

describe("buildDispatchNotificationText", () => {
  it("includes courier, tracking number, and track link", () => {
    const text = buildDispatchNotificationText({
      orderId: "ord_1",
      customerName: "Priya",
      courierName: "Delhivery",
      trackingNumber: "AB123",
      dispatchedAt: "2026-08-19T10:00:00.000Z",
      trackingUrlTemplate: "https://www.delhivery.com/track?waybill={tracking}",
    });

    expect(text).toContain("Order ID: ord_1");
    expect(text).toContain("Courier: Delhivery");
    expect(text).toContain("Tracking number: AB123");
    expect(text).toContain(
      "Track here: https://www.delhivery.com/track?waybill=AB123",
    );
  });

  it("omits track link when tracking number is missing", () => {
    const text = buildDispatchNotificationText({
      orderId: "ord_2",
      courierName: "DTDC",
      dispatchedAt: "2026-08-19T10:00:00.000Z",
      trackingUrlTemplate: "https://www.dtdc.in/track/{tracking}",
    });

    expect(text).not.toContain("Track here:");
    expect(text).not.toContain("Tracking number:");
  });
});
