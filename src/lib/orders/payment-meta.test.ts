import {
  isSamePaymentMeta,
  mergePaymentMeta,
  readPaymentMeta,
} from "./payment-meta";

describe("payment meta helpers", () => {
  it("merges without dropping existing reservation fields", () => {
    const merged = mergePaymentMeta(
      {
        stockReserved: true,
        stockReservationExpiresAt: "2026-06-28T11:00:00.000Z",
        stockReservationLines: [{ productId: "p1", quantity: 1 }],
        paymentEnvironment: "production",
        linePricing: { p1: { unitPrice: 300 } },
      },
      {
        cashfreeOrderStatus: "PAID",
      },
    );

    expect(merged.stockReserved).toBe(true);
    expect(merged.stockReservationLines).toEqual([
      { productId: "p1", quantity: 1 },
    ]);
    expect(merged.paymentEnvironment).toBe("production");
    expect(merged.cashfreeOrderStatus).toBe("PAID");
  });

  it("returns empty object for missing meta", () => {
    expect(readPaymentMeta(null)).toEqual({});
  });

  it("unwraps JSON-string payment_meta so stock release can see holds", () => {
    const encoded = JSON.stringify({
      stockReserved: true,
      stockReservationExpiresAt: "2026-07-10T11:14:53.173Z",
      stockReservationLines: [{ productId: "p1", quantity: 1 }],
      paymentEnvironment: "production",
    });

    const meta = readPaymentMeta(encoded);
    expect(meta.stockReserved).toBe(true);
    expect(meta.stockReservationLines).toEqual([
      { productId: "p1", quantity: 1 },
    ]);
    expect(meta.paymentEnvironment).toBe("production");
  });

  it("unwraps double-encoded JSON strings", () => {
    const doubleEncoded = JSON.stringify(
      JSON.stringify({ stockReserved: true, paymentEnvironment: "production" }),
    );
    const meta = readPaymentMeta(doubleEncoded);
    expect(meta.stockReserved).toBe(true);
    expect(meta.paymentEnvironment).toBe("production");
  });

  it("merges patches onto string-encoded existing meta", () => {
    const existing = JSON.stringify({
      stockReserved: true,
      stockReservationLines: [{ productId: "p1", quantity: 1 }],
    });
    const merged = mergePaymentMeta(existing, {
      stockReleased: true,
      stockReleaseReason: "reservation_expired",
    });
    expect(merged.stockReserved).toBe(true);
    expect(merged.stockReleased).toBe(true);
    expect(merged.stockReservationLines).toEqual([
      { productId: "p1", quantity: 1 },
    ]);
  });

  describe("isSamePaymentMeta", () => {
    const existing = {
      razorpayOrderId: "order_1",
      razorpayPaymentStatus: null,
      stockReservationLines: [{ productId: "p1", quantity: 1 }],
      linePricing: { p1: { unitPrice: 300, mrp: 400 } },
    };

    it("is true when a re-merge changes nothing", () => {
      const merged = mergePaymentMeta(existing, {
        razorpayOrderId: "order_1",
        razorpayPaymentStatus: null,
      });
      expect(isSamePaymentMeta(existing, merged)).toBe(true);
    });

    it("ignores key order, including nested objects", () => {
      expect(
        isSamePaymentMeta(existing, {
          linePricing: { p1: { mrp: 400, unitPrice: 300 } },
          stockReservationLines: [{ quantity: 1, productId: "p1" }],
          razorpayPaymentStatus: null,
          razorpayOrderId: "order_1",
        }),
      ).toBe(true);
    });

    it("detects a new key, even when null", () => {
      expect(
        isSamePaymentMeta(existing, { ...existing, razorpayMethod: null }),
      ).toBe(false);
    });

    it("detects a changed value", () => {
      expect(
        isSamePaymentMeta(existing, {
          ...existing,
          razorpayPaymentStatus: "failed",
        }),
      ).toBe(false);
    });

    it("keeps array order significant", () => {
      expect(isSamePaymentMeta({ lines: [1, 2] }, { lines: [2, 1] })).toBe(
        false,
      );
    });
  });
});
