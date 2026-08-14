/**
 * Browser PUT CORS for THRY storefronts only.
 * Unknown origins get no Access-Control-Allow-Origin (no `*` fallback).
 */

const EXACT_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  "https://thry-thryco.vercel.app",
  "https://thry-self.vercel.app",
  "https://thryco.com",
  "https://www.thryco.com",
  "https://thry.thrycoproduct.workers.dev",
]);

const PREVIEW_ORIGIN_PATTERNS = [
  /^https:\/\/thry(-[\w]+)*-thryco\.vercel\.app$/i,
  /^https:\/\/thry-self-[\w-]+\.vercel\.app$/i,
  /^https:\/\/thry[\w-]*\.thrycoproduct\.workers\.dev$/i,
];

export function isAllowedCorsOrigin(origin: string): boolean {
  if (!origin) return false;
  if (EXACT_ORIGINS.has(origin)) return true;
  return PREVIEW_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Content-Length",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (isAllowedCorsOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
