import {
  CONTENT_SECURITY_POLICY,
  buildNextSecurityHeaders,
} from "../../../security-headers.mjs";

describe("security headers", () => {
  it("includes HSTS and Permissions-Policy for Cloudflare path", () => {
    const headers = buildNextSecurityHeaders({ enforceCsp: false });
    const byKey = Object.fromEntries(headers.map((h) => [h.key, h.value]));

    expect(byKey["Strict-Transport-Security"]).toContain("max-age=63072000");
    expect(byKey["Permissions-Policy"]).toContain("camera=(self)");
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Content-Security-Policy-Report-Only"]).toBe(
      CONTENT_SECURITY_POLICY,
    );
    expect(byKey["Content-Security-Policy"]).toBeUndefined();
  });

  it("can enforce CSP after report-only validation", () => {
    const headers = buildNextSecurityHeaders({ enforceCsp: true });
    const byKey = Object.fromEntries(headers.map((h) => [h.key, h.value]));
    expect(byKey["Content-Security-Policy"]).toBe(CONTENT_SECURITY_POLICY);
    expect(byKey["Content-Security-Policy-Report-Only"]).toBeUndefined();
  });

  it("allows Cashfree SDK and Supabase in the CSP allowlist", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("https://sdk.cashfree.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://checkout.razorpay.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://cdn.razorpay.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://*.razorpay.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://api.razorpay.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://*.supabase.co");
    expect(CONTENT_SECURITY_POLICY).toContain("https://*.ingest.sentry.io");
    expect(CONTENT_SECURITY_POLICY).toContain("worker-src 'self' blob:");
    expect(CONTENT_SECURITY_POLICY).toContain("https://www.clarity.ms");
    expect(CONTENT_SECURITY_POLICY).toContain("https://scripts.clarity.ms");
    expect(CONTENT_SECURITY_POLICY).toContain("https://*.clarity.ms");
    expect(CONTENT_SECURITY_POLICY).toContain("https://c.bing.com");
    expect(CONTENT_SECURITY_POLICY).toContain(
      "https://*.r2.cloudflarestorage.com",
    );
    expect(CONTENT_SECURITY_POLICY).toContain("https://media.thryco.com");
  });

  it("allows the Cloudflare Web Analytics beacon (script + RUM endpoint)", () => {
    const scriptSrc = CONTENT_SECURITY_POLICY.match(/script-src ([^;]+);/)?.[1];
    const connectSrc = CONTENT_SECURITY_POLICY.match(/connect-src ([^;]+);/)?.[1];
    expect(scriptSrc).toContain("https://static.cloudflareinsights.com");
    expect(connectSrc).toContain("https://cloudflareinsights.com");
  });
});
