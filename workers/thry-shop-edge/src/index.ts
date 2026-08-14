/**
 * THRY shop hostname on Cloudflare → existing Vercel deployment.
 * Used because Wrangler OAuth can attach Worker custom domains but cannot
 * edit zone DNS records (A/CNAME) for Vercel.
 */
const ORIGIN = "https://thry-thryco.vercel.app";
const APEX = "thryco.com";
const WWW = "www.thryco.com";

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

export default {
  async fetch(request: Request): Promise<Response> {
    const incoming = new URL(request.url);
    const host = incoming.hostname.toLowerCase();

    if (host === WWW) {
      incoming.hostname = APEX;
      incoming.protocol = "https:";
      return Response.redirect(incoming.toString(), 308);
    }

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
    // Upstream Host is *.vercel.app, which Vercel marks noindex.
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
  },
};
