import {
  PACKING_SLIP_BRAND,
  PACKING_SLIP_THANKS,
  formatPackingSlipDate,
  formatPackingSlipOrderHeading,
  formatPackingSlipQuantity,
  buildPackingSlipRecipientLines,
  buildPackingSlipShopFooter,
} from "./packing-slip-format";

describe("packing slip format (THRY CO. reference)", () => {
  it("prints quantity as 1 of 1", () => {
    expect(formatPackingSlipQuantity(1)).toBe("1 of 1");
    expect(formatPackingSlipQuantity(3)).toBe("3 of 3");
  });

  it("prints Order # heading", () => {
    expect(formatPackingSlipOrderHeading("INV-0501201")).toBe(
      "Order #INV-0501201",
    );
  });

  it("prints date like 16 August 2026 in IST", () => {
    expect(formatPackingSlipDate("2026-08-16T06:00:00.000Z")).toBe(
      "16 August 2026",
    );
  });

  it("puts name, street, pincode city state, country, and phone on SHIP TO", () => {
    const lines = buildPackingSlipRecipientLines({
      customerName: "Anshula Tayal",
      customerMobile: "9654445244",
      includePhone: true,
      shippingAddress: {
        line1: "C-410 Sfs Flats Triveni Apartment",
        line2: "Sheikh Sarai phase 1",
        city: "New Delhi",
        state: "Delhi",
        postalCode: "110017",
        country: "India",
      },
    });
    expect(lines).toEqual([
      "Anshula Tayal",
      "C-410 Sfs Flats Triveni Apartment",
      "Sheikh Sarai phase 1",
      "110017 New Delhi DL",
      "India",
      "9654445244",
    ]);
  });

  it("omits phone on BILL TO", () => {
    const lines = buildPackingSlipRecipientLines({
      customerName: "Anshula Tayal",
      customerMobile: "9654445244",
      includePhone: false,
      shippingAddress: {
        line1: "C-410",
        line2: null,
        city: "New Delhi",
        state: "Delhi",
        postalCode: "110017",
        country: "India",
      },
    });
    expect(lines).not.toContain("9654445244");
    expect(lines.at(-1)).toBe("India");
  });

  it("prints shop footer as street, pincode city ST, country + Mobile", () => {
    const footer = buildPackingSlipShopFooter();
    expect(footer.brand).toBe(PACKING_SLIP_BRAND);
    expect(footer.brand).toBe("THRY CO.");
    expect(PACKING_SLIP_THANKS).toBe("Thank you for shopping with us!");
    expect(footer.address).toBe(
      "355/1, Balaji Nagar Bedrapalii, Sipcot-1, 635126 Hosur TN, India",
    );
    expect(footer.mobile).toBe("Mobile: +91 97900 49838");
  });
});
