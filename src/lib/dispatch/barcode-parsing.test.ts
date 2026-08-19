import { parseTrackingNumberFromBarcodeText } from "./barcode-parsing";

describe("parseTrackingNumberFromBarcodeText", () => {
  it("returns sanitized tracking when input is clean", () => {
    expect(parseTrackingNumberFromBarcodeText("AB-12345")).toBe("AB-12345");
    expect(parseTrackingNumberFromBarcodeText("ab_987")).toBe("AB_987");
  });

  it("extracts the first digit-containing token", () => {
    expect(parseTrackingNumberFromBarcodeText("Tracking: ab-12345")).toBe(
      "AB-12345",
    );

    expect(parseTrackingNumberFromBarcodeText("Code AB-12345, XY-99999")).toBe(
      "AB-12345",
    );
  });

  it("removes whitespace when scanning output contains spaces", () => {
    expect(parseTrackingNumberFromBarcodeText("ab 123 45")).toBe("AB12345");
  });

  it("returns null when no valid token exists", () => {
    expect(parseTrackingNumberFromBarcodeText("NOTHING HERE")).toBeNull();
    expect(parseTrackingNumberFromBarcodeText("")).toBeNull();
    expect(parseTrackingNumberFromBarcodeText(null)).toBeNull();
  });
});
