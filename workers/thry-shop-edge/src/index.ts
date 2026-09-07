/**
 * THRY shop hostname on Cloudflare → Vercel origin.
 *
 * Production edge cache (industry-safe):
 * - Cache public catalog HTML + public storefront APIs (short TTL)
 * - Never cache cart / checkout / auth / account / admin
 * - Bypass when Supabase auth cookies or Authorization are present
 * - Never store responses that Set-Cookie
 *
 * X-THRY-Cache: HIT | MISS | BYPASS
 */
const ORIGIN = "https://thry-thryco.vercel.app";
const APEX = "thryco.com";
const WWW = "www.thryco.com";

/** Fallback TTL when origin omits s-maxage (seconds). */
const DEFAULT_HTML_S_MAXAGE = 60;
const DEFAULT_API_S_MAXAGE = 120;
/** Hard ceiling so a misconfigured origin cannot pin cache too long. */
const MAX_S_MAXAGE = 300;

const SIZE_CONFIG_PATH = "/api/products/size-config";

const HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-ew-via",
  "cdn-loop",
]);

/** Paths that must never be served from shared edge cache. */
const PRIVATE_PREFIXES = [
  "/cart",
  "/orders",
  "/wish-list",
  "/setting",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/auth/",
  "/admin",
  "/api/admin",
  "/api/cart",
  "/api/checkout",
  "/api/create-checkout-session",
  "/api/orders",
  "/api/cashfree",
  "/api/razorpay",
  "/api/phonepe",
  "/api/cron",
  "/api/storefront/welcome-offer",
] as const;

function copyHeaders(source: Headers, extra?: Record<string, string>): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (!HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  }
  return headers;
}

function rewriteLocation(value: string, incomingHost: string): string {
  try {
    const url = new URL(value, `https://${incomingHost}`);
    if (
      url.hostname === "thry-thryco.vercel.app" ||
      url.hostname === "thry-self.vercel.app" ||
      url.hostname.endsWith(".vercel.app")
    ) {
      url.protocol = "https:";
      url.hostname = incomingHost === WWW ? APEX : incomingHost;
    }
    return url.toString();
  } catch {
    return value;
  }
}

function hasSupabaseAuthCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return /(?:^|;\s*)sb-[^=;\s]+-auth-token=/.test(cookieHeader);
}

function isPrivatePath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return PRIVATE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix),
  );
}

function isPublicHtmlPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  if (path === "/" || path === "") return true;
  if (path === "/shop" || path.startsWith("/shop/")) return true;
  if (path === "/collections" || path.startsWith("/collections/")) return true;
  if (path === "/featured") return true;
  if (
    path === "/about" ||
    path === "/contact" ||
    path === "/faq" ||
    path === "/shipping-returns" ||
    path === "/privacy-policy" ||
    path === "/payment-methods" ||
    path === "/store-policy" ||
    path === "/terms-and-conditions" ||
    path === "/terms-of-use"
  ) {
    return true;
  }
  return false;
}

function isPublicStorefrontApi(pathname: string): boolean {
  const path = pathname.toLowerCase();
  if (path === SIZE_CONFIG_PATH) return true;
  if (path === "/api/storefront/products") return true;
  if (path === "/api/storefront/products/suggest") return true;
  if (path === "/api/storefront/collections") return true;
  if (path === "/api/storefront/pack-labels") return true;
  return false;
}

function isCacheableGet(request: Request, url: URL): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (request.headers.has("authorization")) return false;
  if (hasSupabaseAuthCookie(request.headers.get("cookie"))) return false;
  if (isPrivatePath(url.pathname)) return false;
  return isPublicHtmlPath(url.pathname) || isPublicStorefrontApi(url.pathname);
}

/** Stable cache key: apex host; size-config productIds sorted. */
function normalizeCacheKeyUrl(requestUrl: URL): URL {
  const cacheUrl = new URL(requestUrl.toString());
  cacheUrl.hostname = APEX;
  cacheUrl.protocol = "https:";
  cacheUrl.hash = "";
  cacheUrl.port = "";

  if (cacheUrl.pathname === SIZE_CONFIG_PATH) {
    const productIdsParam = cacheUrl.searchParams.get("productIds");
    if (productIdsParam) {
      const ids = [
        ...new Set(
          productIdsParam
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ].sort();
      cacheUrl.search = "";
      if (ids.length > 0) {
        cacheUrl.searchParams.set("productIds", ids.join(","));
      }
    }
  }

  return cacheUrl;
}

function parseSMaxAge(
  cacheControl: string | null,
  fallback: number,
): number {
  if (!cacheControl) return fallback;
  const lower = cacheControl.toLowerCase();
  if (lower.includes("no-store") || lower.includes("private")) return 0;
  const match = lower.match(/(?:^|,)\s*s-maxage=(\d+)/);
  if (match) return Math.min(Number(match[1]), MAX_S_MAXAGE);
  const maxAge = lower.match(/(?:^|,)\s*max-age=(\d+)/);
  if (maxAge) return Math.min(Number(maxAge[1]), MAX_S_MAXAGE);
  return fallback;
}

/**
 * Edge TTL for anonymous public responses.
 * Next.js App Router often sends `private, no-store` on HTML even for public
 * catalog pages — safe to edge-cache briefly after auth/cookie gates above.
 */
function resolveEdgeTtl(
  pathname: string,
  cacheControl: string | null,
): number {
  if (isPublicStorefrontApi(pathname)) {
    return parseSMaxAge(cacheControl, DEFAULT_API_S_MAXAGE);
  }
  if (isPublicHtmlPath(pathname)) {
    const parsed = parseSMaxAge(cacheControl, DEFAULT_HTML_S_MAXAGE);
    if (parsed > 0) return parsed;
    // Origin no-store/private on public HTML → still allow short edge TTL.
    return DEFAULT_HTML_S_MAXAGE;
  }
  return 0;
}

function withCacheHeader(response: Response, value: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-THRY-Cache", value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function fetchOrigin(
  request: Request,
  incoming: URL,
  host: string,
): Promise<Response> {
  const outbound = new URL(incoming.pathname + incoming.search, ORIGIN);
  const headers = copyHeaders(request.headers, {
    "X-Forwarded-Host": APEX,
    "X-Forwarded-Proto": "https",
  });
  headers.delete("accept-encoding");

  const init: RequestInit & { cf?: RequestInitCfProperties } = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  const upstream = await fetch(outbound, init);
  const outHeaders = copyHeaders(upstream.headers);
  const location = outHeaders.get("location");
  if (location) {
    outHeaders.set("location", rewriteLocation(location, host));
  }
  if (
    (outHeaders.get("x-robots-tag") || "").toLowerCase().includes("noindex")
  ) {
    outHeaders.delete("x-robots-tag");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

async function handleCachedGet(
  request: Request,
  incoming: URL,
  host: string,
): Promise<Response> {
  const cache = caches.default;
  const cacheKeyUrl = normalizeCacheKeyUrl(incoming);
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) {
    return withCacheHeader(cached, "HIT");
  }

  const upstream = await fetchOrigin(request, incoming, host);
  const cacheControl = upstream.headers.get("cache-control");
  const sMaxAge = resolveEdgeTtl(incoming.pathname, cacheControl);

  // Never share personalized or uncacheable responses.
  if (
    upstream.status !== 200 ||
    sMaxAge <= 0 ||
    upstream.headers.has("set-cookie")
  ) {
    return withCacheHeader(upstream, "BYPASS");
  }

  const bodyText = await upstream.clone().text();
  if (!bodyText.trim()) {
    return withCacheHeader(upstream, "BYPASS");
  }

  // Guard oversized bodies (Worker Cache API practicality).
  if (bodyText.length > 1_500_000) {
    return withCacheHeader(upstream, "BYPASS");
  }

  const storeHeaders = new Headers(upstream.headers);
  storeHeaders.delete("set-cookie");
  storeHeaders.set(
    "Cache-Control",
    `public, s-maxage=${sMaxAge}, stale-while-revalidate=${Math.min(sMaxAge * 2, MAX_S_MAXAGE)}`,
  );
  storeHeaders.set("X-THRY-Cache", "MISS");

  const toStore = new Response(bodyText, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: storeHeaders,
  });

  await cache.put(cacheKey, toStore.clone());
  return toStore;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const incoming = new URL(request.url);
    const host = incoming.hostname.toLowerCase();

    if (incoming.protocol === "http:") {
      incoming.protocol = "https:";
      return Response.redirect(incoming.toString(), 308);
    }

    if (host === WWW) {
      incoming.hostname = APEX;
      incoming.protocol = "https:";
      return Response.redirect(incoming.toString(), 308);
    }

    if (isCacheableGet(request, incoming)) {
      return handleCachedGet(request, incoming, host);
    }

    const upstream = await fetchOrigin(request, incoming, host);
    return withCacheHeader(upstream, "BYPASS");
  },
};
