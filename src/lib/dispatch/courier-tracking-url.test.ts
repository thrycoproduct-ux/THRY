import {
  buildCourierTrackingUrl,
  resolveCourierTrackingUrl,
} from "./courier-tracking-url";

describe("buildCourierTrackingUrl", () => {
  it("replaces {tracking} in query templates", () => {
    expect(
      buildCourierTrackingUrl(
        "https://www.delhivery.com/track?waybill={tracking}",
        "ab-12345",
      ),
    ).toBe("https://www.delhivery.com/track?waybill=ab-12345");
  });

  it("replaces {tracking} in path templates", () => {
    expect(
      buildCourierTrackingUrl(
        "https://www.bluedart.com/track/{tracking}",
        "XY999",
      ),
    ).toBe("https://www.bluedart.com/track/XY999");
  });

  it("appends tracking when template has no placeholder", () => {
    expect(buildCourierTrackingUrl("https://example.com/track", "ABC123")).toBe(
      "https://example.com/track/ABC123",
    );
  });

  it("returns null without tracking when template needs it", () => {
    expect(
      buildCourierTrackingUrl(
        "https://www.delhivery.com/track?waybill={tracking}",
        "",
      ),
    ).toBeNull();
  });

  it("rejects invalid URLs", () => {
    expect(buildCourierTrackingUrl("not-a-url/{tracking}", "123")).toBeNull();
  });
});

describe("resolveCourierTrackingUrl", () => {
  it("prefers the stored snapshot over live fallback", () => {
    expect(
      resolveCourierTrackingUrl({
        trackingNumber: "123",
        templateSnapshot: "https://snap.test/{tracking}",
        templateFallback: "https://live.test/{tracking}",
      }),
    ).toBe("https://snap.test/123");
  });

  it("falls back to live template when snapshot is missing", () => {
    expect(
      resolveCourierTrackingUrl({
        trackingNumber: "123",
        templateSnapshot: null,
        templateFallback: "https://live.test/{tracking}",
      }),
    ).toBe("https://live.test/123");
  });
});
