import {
  courierNameToIdBase,
  normalizeCourierName,
  parseCreateDispatchCourierPayload,
  validateTrackingUrlTemplate,
} from "./courier-form";

describe("normalizeCourierName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeCourierName("  Ekart   Logistics  ")).toBe(
      "Ekart Logistics",
    );
  });
});

describe("validateTrackingUrlTemplate", () => {
  it("accepts empty template", () => {
    expect(validateTrackingUrlTemplate("")).toBeNull();
    expect(validateTrackingUrlTemplate(null)).toBeNull();
  });

  it("accepts valid http(s) templates", () => {
    expect(
      validateTrackingUrlTemplate("https://track.example.com/{tracking}"),
    ).toBe("https://track.example.com/{tracking}");
  });

  it("rejects invalid templates", () => {
    expect(() => validateTrackingUrlTemplate("not-a-url")).toThrow(
      /valid http\(s\) tracking URL/i,
    );
  });
});

describe("parseCreateDispatchCourierPayload", () => {
  it("accepts name-only payload", () => {
    const result = parseCreateDispatchCourierPayload({ name: "Ekart" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Ekart");
      expect(result.data.trackingUrlTemplate).toBeNull();
    }
  });

  it("rejects too-short names", () => {
    const result = parseCreateDispatchCourierPayload({ name: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects blank names", () => {
    const result = parseCreateDispatchCourierPayload({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects invalid tracking templates", () => {
    const result = parseCreateDispatchCourierPayload({
      name: "Local Courier",
      trackingUrlTemplate: "bad-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("courierNameToIdBase", () => {
  it("slugifies courier names for ids", () => {
    expect(courierNameToIdBase("Ekart Logistics")).toBe("ekartlogistics");
  });
});
