/**
 * THRY shop hostname on Cloudflare → existing Vercel deployment.
 * Edge-caches public GET /api/products/size-config to cut origin invocations.
 */
const ORIGIN = "https://thry-thryco.vercel.app";
const APEX = "thryco.com";
const WWW = "www.thryco.com";
const SIZE_CONFIG_PATH = "/api/products/size-config";
const DEFAULT_S_MAXAGE = 120;

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

/** Stable cache key: sort+dedupe productIds; leave productId alone. */
function normalizeSizeConfigCacheUrl(requestUrl: URL): URL {
  const cacheUrl = new URL(requestUrl.toString());
  cacheUrl.hostname = APEX;
  cacheUrl.protocol = "https:";
  cacheUrl.hash = "";

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

  return cacheUrl;
}

function isSizeConfigGet(request: Request, url: URL): boolean {
  return (
    request.method === "GET" &&
    url.pathname === SIZE_CONFIG_PATH &&
    !request.headers.has("authorization")
  );
}

function parseSMaxAge(cacheControl: string | null): number {
  if (!cacheControl) return DEFAULT_S_MAXAGE;
  const lower = cacheControl.toLowerCase();
  if (lower.includes("no-store") || lower.includes("private")) return 0;
  const match = lower.match(/(?:^|,)\s*s-maxage=(\d+)/);
  if (match) return Number(match[1]);
  const maxAge = lower.match(/(?:^|,)\s*max-age=(\d+)/);
  if (maxAge) return Number(maxAge[1]);
  return DEFAULT_S_MAXAGE;
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

  const init: RequestInit = {
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

async function handleSizeConfigCached(
  request: Request,
  incoming: URL,
  host: string,
): Promise<Response> {
  const cache = caches.default;
  const cacheKeyUrl = normalizeSizeConfigCacheUrl(incoming);
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) {
    const hitHeaders = new Headers(cached.headers);
    hitHeaders.set("X-THRY-Cache", "HIT");
    return new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers: hitHeaders,
    });
  }

  const upstream = await fetchOrigin(request, incoming, host);
  const cacheControl = upstream.headers.get("cache-control");
  const sMaxAge = parseSMaxAge(cacheControl);

  if (upstream.status !== 200 || sMaxAge <= 0) {
    const missHeaders = new Headers(upstream.headers);
    missHeaders.set("X-THRY-Cache", "BYPASS");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: missHeaders,
    });
  }

  const bodyText = await upstream.clone().text();
  if (!bodyText.trim()) {
    const missHeaders = new Headers(upstream.headers);
    missHeaders.set("X-THRY-Cache", "BYPASS");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: missHeaders,
    });
  }

  const storeHeaders = new Headers(upstream.headers);
  // Ensure Cache API respects TTL even if browsers ignore s-maxage.
  if (!storeHeaders.has("Cache-Control")) {
    storeHeaders.set(
      "Cache-Control",
      `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 2}`,
    );
  }
  storeHeaders.set("X-THRY-Cache", "MISS");

  const toStore = new Response(bodyText, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: storeHeaders,
  });

  // Cache API ignores some headers; set Cache-Control on the stored response.
  await cache.put(cacheKey, toStore.clone());

  return toStore;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const incoming = new URL(request.url);
    const host = incoming.hostname.toLowerCase();

    if (host === WWW) {
      incoming.hostname = APEX;
      incoming.protocol = "https:";
      return Response.redirect(incoming.toString(), 308);
    }

    if (isSizeConfigGet(request, incoming)) {
      return handleSizeConfigCached(request, incoming, host);
    }

    return fetchOrigin(request, incoming, host);
  },
};
