import {
  buildReservationExpiryIso,
  canReleaseOrphanUnpaidHold,
  hasActiveStockReservation,
  isReservationExpired,
  readReservationLines,
  shouldReserveStockAtCheckout,
  STOCK_RESERVATION_TTL_MINUTES,
} from "./stock-reservation-helpers";

describe("stock reservation helpers", () => {
  it("never holds stock at checkout (deducted on payment)", () => {
    expect(shouldReserveStockAtCheckout("production")).toBe(false);
    expect(shouldReserveStockAtCheckout("sandbox")).toBe(false);
  });

  it("never restocks orders that deduct on payment", () => {
    const now = Date.parse("2026-07-07T12:00:00.000Z");
    const meta = {
      paymentEnvironment: "production",
      stockDeductOnPayment: true,
    };
    for (const reason of [
      "checkout_failed",
      "payment_failed",
      "reservation_expired",
    ]) {
      expect(
        canReleaseOrphanUnpaidHold(
          meta,
          "2026-07-07T10:00:00.000Z",
          reason,
          now,
        ),
      ).toBe(false);
    }
  });

  it("builds a reservation expiry in the future", () => {
    const now = Date.parse("2026-06-28T10:00:00.000Z");
    const expiresAt = buildReservationExpiryIso(now);
    expect(Date.parse(expiresAt)).toBe(
      now + STOCK_RESERVATION_TTL_MINUTES * 60_000,
    );
  });

  it("detects expired reservations", () => {
    expect(
      isReservationExpired(
        { stockReservationExpiresAt: "2026-06-28T09:00:00.000Z" },
        Date.parse("2026-06-28T10:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isReservationExpired(
        { stockReservationExpiresAt: "2026-06-28T11:00:00.000Z" },
        Date.parse("2026-06-28T10:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("reads reservation lines from payment meta", () => {
    const lines = readReservationLines({
      stockReservationLines: [
        { productId: "prod_1", quantity: 2, size: "M" },
        { productId: "", quantity: 1 },
      ],
    });

    expect(lines).toEqual([{ productId: "prod_1", quantity: 2, size: "M" }]);
  });

  it("detects active reservations", () => {
    expect(
      hasActiveStockReservation({
        stockReserved: true,
        stockReservationLines: [{ productId: "prod_1", quantity: 1 }],
      }),
    ).toBe(true);
    expect(
      hasActiveStockReservation({
        stockReserved: true,
        stockReleased: true,
        stockReservationLines: [{ productId: "prod_1", quantity: 1 }],
      }),
    ).toBe(false);
    expect(
      hasActiveStockReservation({
        stockReserved: true,
        inventoryFulfilled: true,
        stockReservationLines: [{ productId: "prod_1", quantity: 1 }],
      }),
    ).toBe(false);
    expect(
      hasActiveStockReservation({
        stockReserved: true,
        stockReservationConsumed: true,
        stockReservationLines: [{ productId: "prod_1", quantity: 1 }],
      }),
    ).toBe(false);
  });

  it("detects orphan unpaid holds eligible for release", () => {
    const now = Date.parse("2026-07-07T12:00:00.000Z");
    const createdAt = "2026-07-07T11:00:00.000Z";

    expect(
      canReleaseOrphanUnpaidHold(
        {
          paymentEnvironment: "production",
        },
        createdAt,
        "reservation_expired",
        now,
      ),
    ).toBe(true);

    expect(
      canReleaseOrphanUnpaidHold(
        {
          paymentEnvironment: "production",
        },
        "2026-07-07T11:45:00.000Z",
        "reservation_expired",
        now,
      ),
    ).toBe(false);

    expect(
      canReleaseOrphanUnpaidHold(
        {
          paymentEnvironment: "production",
        },
        createdAt,
        "checkout_failed",
        now,
      ),
    ).toBe(true);

    expect(
      canReleaseOrphanUnpaidHold(
        {
          paymentEnvironment: "production",
          stockReleased: true,
        },
        createdAt,
        "reservation_expired",
        now,
      ),
    ).toBe(false);
  });
});
