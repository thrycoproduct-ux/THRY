import {
  getAllowedAuthOrigins,
  getAuthCallbackUrls,
  resolveOAuthBrowserOrigin,
} from "./site-urls";

describe("resolveOAuthBrowserOrigin", () => {
  const prev = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://thryco.com";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prev;
  });

  it("keeps www when the shopper opened www (PKCE-safe)", () => {
    expect(resolveOAuthBrowserOrigin("https://www.thryco.com")).toBe(
      "https://www.thryco.com",
    );
  });

  it("keeps apex when the shopper opened apex", () => {
    expect(resolveOAuthBrowserOrigin("https://thryco.com")).toBe(
      "https://thryco.com",
    );
  });

  it("falls back to canonical for unknown hosts", () => {
    expect(resolveOAuthBrowserOrigin("https://evil.example")).toBe(
      "https://thryco.com",
    );
  });
});

describe("getAuthCallbackUrls", () => {
  it("includes apex and www callbacks", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://thryco.com";
    const urls = getAuthCallbackUrls();
    expect(urls).toEqual(
      expect.arrayContaining([
        "https://thryco.com/auth/callback",
        "https://www.thryco.com/auth/callback",
      ]),
    );
    expect(getAllowedAuthOrigins()).toEqual(
      expect.arrayContaining(["https://thryco.com", "https://www.thryco.com"]),
    );
  });
});
