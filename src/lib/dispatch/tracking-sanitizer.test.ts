import { sanitizeTrackingNumber } from "./tracking-sanitizer";

describe("sanitizeTrackingNumber", () => {
  it("returns null for empty/blank input", () => {
    expect(sanitizeTrackingNumber(null)).toBeNull();
    expect(sanitizeTrackingNumber(undefined)).toBeNull();
    expect(sanitizeTrackingNumber("")).toBeNull();
    expect(sanitizeTrackingNumber("   ")).toBeNull();
  });

  it("removes whitespace and uppercases", () => {
    expect(sanitizeTrackingNumber(" ab -123 45 ")).toBe("AB-12345");
    expect(sanitizeTrackingNumber("x_y")).toBe("X_Y");
    expect(sanitizeTrackingNumber("a/b")).toBe("A/B");
  });

  it("rejects unsupported characters", () => {
    expect(() => sanitizeTrackingNumber("AB#123")).toThrow(
      /Invalid tracking number/i,
    );
    expect(() => sanitizeTrackingNumber("AB,123")).toThrow(
      /Invalid tracking number/i,
    );
  });

  it("enforces max length", () => {
    const tooLong = "A".repeat(65);
    expect(() => sanitizeTrackingNumber(tooLong)).toThrow(
      /Tracking number too long/i,
    );
  });
});

