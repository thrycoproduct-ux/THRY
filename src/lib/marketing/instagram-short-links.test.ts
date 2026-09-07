import {
  buildInstagramShortLinkTarget,
  normalizeInstagramShortCode,
} from "./instagram-short-links";

const ORIGIN = "https://thryco.com";

describe("instagram short links", () => {
  it("maps known codes to collections with UTM tags", () => {
    const url = buildInstagramShortLinkTarget("dual", ORIGIN);
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/collections/dual-stamp-collections");
    expect(url.searchParams.get("utm_source")).toBe("instagram");
    expect(url.searchParams.get("utm_medium")).toBe("dm");
    expect(url.searchParams.get("utm_campaign")).toBe("dual");
  });

  it("is case/whitespace tolerant", () => {
    expect(buildInstagramShortLinkTarget(" Blocks ", ORIGIN).pathname).toBe(
      "/collections/fabric-printing-blocks-collections",
    );
  });

  it("falls back to /collections/<slug> for unknown slugs", () => {
    const url = buildInstagramShortLinkTarget("devin-symbol-stamps", ORIGIN);
    expect(url.pathname).toBe("/collections/devin-symbol-stamps");
    expect(url.searchParams.get("utm_campaign")).toBe("devin-symbol-stamps");
  });

  it("rejects unsafe codes and sends them to /shop", () => {
    expect(normalizeInstagramShortCode("../admin")).toBeNull();
    expect(normalizeInstagramShortCode("a b")).toBeNull();
    const url = buildInstagramShortLinkTarget("//evil.com", ORIGIN);
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/shop");
    expect(url.searchParams.get("utm_campaign")).toBe("unknown");
  });

  it("never redirects off-origin", () => {
    const url = buildInstagramShortLinkTarget("https:evil.com", ORIGIN);
    expect(url.origin).toBe(ORIGIN);
  });
});
