/** Shared security headers for Next (Cloudflare Workers) and unit tests. */

export const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
];

export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; base-uri 'self'; form-action 'self' https://accounts.google.com https://api.cashfree.com https://sandbox.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com https://www.cashfree.com https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com; object-src 'none'; frame-ancestors 'self'; script-src 'self' 'unsafe-inline' https://sdk.cashfree.com https://checkout.razorpay.com https://cdn.razorpay.com https://*.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://api.cashfree.com https://sandbox.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com https://www.cashfree.com https://api.razorpay.com https://checkout.razorpay.com https://cdn.razorpay.com https://lumberjack.razorpay.com https://*.razorpay.com; frame-src 'self' https://accounts.google.com https://www.youtube-nocookie.com https://player.vimeo.com https://sdk.cashfree.com https://api.cashfree.com https://sandbox.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com https://www.cashfree.com https://api.razorpay.com https://checkout.razorpay.com https://cdn.razorpay.com https://*.razorpay.com; upgrade-insecure-requests";

export function buildNextSecurityHeaders(options = {}) {
  const enforceCsp = options.enforceCsp === true;
  return [
    ...SECURITY_HEADERS.map((header) => ({ ...header })),
    {
      key: enforceCsp
        ? "Content-Security-Policy"
        : "Content-Security-Policy-Report-Only",
      value: CONTENT_SECURITY_POLICY,
    },
  ];
}
