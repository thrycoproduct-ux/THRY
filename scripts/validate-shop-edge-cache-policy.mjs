/**
 * Pure helpers mirrored for offline validation of edge-cache policy.
 * Keep in sync with workers/thry-shop-edge/src/index.ts rules.
 */
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
];

const STATIC_INFO_PATHS = new Set([
  "/about",
  "/contact",
  "/faq",
  "/shipping-returns",
  "/privacy-policy",
  "/payment-methods",
  "/store-policy",
  "/terms-and-conditions",
  "/terms-of-use",
]);

const DEFAULT_HTML_S_MAXAGE = 120;
const DEFAULT_STATIC_HTML_S_MAXAGE = 600;
const DEFAULT_API_S_MAXAGE = 120;
const MAX_S_MAXAGE = 300;
const MAX_STATIC_HTML_S_MAXAGE = 900;

function hasSupabaseAuthCookie(cookieHeader) {
  if (!cookieHeader) return false;
  return /(?:^|;\s*)sb-[^=;\s]+-auth-token=/.test(cookieHeader);
}

function isPrivatePath(pathname) {
  const path = pathname.toLowerCase();
  return PRIVATE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix),
  );
}

function isStaticInfoHtmlPath(pathname) {
  return STATIC_INFO_PATHS.has(pathname.toLowerCase());
}

function isPublicHtmlPath(pathname) {
  const path = pathname.toLowerCase();
  if (path === "/" || path === "") return true;
  if (path === "/shop" || path.startsWith("/shop/")) return true;
  if (path === "/collections" || path.startsWith("/collections/")) return true;
  if (path === "/featured") return true;
  return isStaticInfoHtmlPath(path);
}

function isPublicStorefrontApi(pathname) {
  const path = pathname.toLowerCase();
  return (
    path === "/api/products/size-config" ||
    path === "/api/storefront/products" ||
    path === "/api/storefront/products/suggest" ||
    path === "/api/storefront/collections" ||
    path === "/api/storefront/pack-labels"
  );
}

function isCacheableGet({ method, pathname, cookie, authorization }) {
  if (method !== "GET" && method !== "HEAD") return false;
  if (authorization) return false;
  if (hasSupabaseAuthCookie(cookie || null)) return false;
  if (isPrivatePath(pathname)) return false;
  return isPublicHtmlPath(pathname) || isPublicStorefrontApi(pathname);
}

function parseSMaxAge(cacheControl, fallback, ceiling) {
  if (!cacheControl) return fallback;
  const lower = cacheControl.toLowerCase();
  if (lower.includes("no-store") || lower.includes("private")) return 0;
  const match = lower.match(/(?:^|,)\s*s-maxage=(\d+)/);
  if (match) return Math.min(Number(match[1]), ceiling);
  const maxAge = lower.match(/(?:^|,)\s*max-age=(\d+)/);
  if (maxAge) return Math.min(Number(maxAge[1]), ceiling);
  return fallback;
}

function resolveEdgeTtl(pathname, cacheControl) {
  if (isPublicStorefrontApi(pathname)) {
    return parseSMaxAge(cacheControl, DEFAULT_API_S_MAXAGE, MAX_S_MAXAGE);
  }
  if (isStaticInfoHtmlPath(pathname)) {
    const parsed = parseSMaxAge(
      cacheControl,
      DEFAULT_STATIC_HTML_S_MAXAGE,
      MAX_STATIC_HTML_S_MAXAGE,
    );
    if (parsed <= 0) return DEFAULT_STATIC_HTML_S_MAXAGE;
    return Math.max(parsed, DEFAULT_STATIC_HTML_S_MAXAGE);
  }
  if (isPublicHtmlPath(pathname)) {
    const parsed = parseSMaxAge(
      cacheControl,
      DEFAULT_HTML_S_MAXAGE,
      MAX_S_MAXAGE,
    );
    if (parsed > 0) return parsed;
    return DEFAULT_HTML_S_MAXAGE;
  }
  return 0;
}

const cases = [
  { name: "home GET", method: "GET", pathname: "/", expect: true },
  { name: "shop GET", method: "GET", pathname: "/shop", expect: true },
  {
    name: "pdp GET",
    method: "GET",
    pathname: "/shop/baby-shivan-idol",
    expect: true,
  },
  {
    name: "payment-methods GET",
    method: "GET",
    pathname: "/payment-methods",
    expect: true,
  },
  {
    name: "storefront products API",
    method: "GET",
    pathname: "/api/storefront/products",
    expect: true,
  },
  { name: "cart never", method: "GET", pathname: "/cart", expect: false },
  {
    name: "checkout api never",
    method: "GET",
    pathname: "/api/create-checkout-session",
    expect: false,
  },
  {
    name: "welcome-offer never",
    method: "GET",
    pathname: "/api/storefront/welcome-offer",
    expect: false,
  },
  {
    name: "auth cookie bypass",
    method: "GET",
    pathname: "/shop",
    cookie: "sb-azqg-auth-token=abc",
    expect: false,
  },
  {
    name: "POST never",
    method: "POST",
    pathname: "/shop",
    expect: false,
  },
];

const ttlCases = [
  {
    name: "static info TTL floor 600",
    pathname: "/payment-methods",
    cacheControl: "public, s-maxage=60",
    expect: 600,
  },
  {
    name: "static info no-store still 600",
    pathname: "/shipping-returns",
    cacheControl: "private, no-store",
    expect: 600,
  },
  {
    name: "catalog HTML respects short s-maxage capped",
    pathname: "/collections/art-craft",
    cacheControl: "public, s-maxage=60",
    expect: 60,
  },
  {
    name: "catalog HTML no-store → default 120",
    pathname: "/featured",
    cacheControl: "private, no-store",
    expect: 120,
  },
  {
    name: "cart path TTL 0",
    pathname: "/cart",
    cacheControl: "public, s-maxage=60",
    expect: 0,
  },
];

let failed = 0;
for (const c of cases) {
  const got = isCacheableGet(c);
  const ok = got === c.expect;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name} → ${got} (want ${c.expect})`);
  if (!ok) failed += 1;
}
for (const c of ttlCases) {
  const got = resolveEdgeTtl(c.pathname, c.cacheControl);
  const ok = got === c.expect;
  console.log(
    `${ok ? "PASS" : "FAIL"}  TTL ${c.name} → ${got} (want ${c.expect})`,
  );
  if (!ok) failed += 1;
}
process.exit(failed ? 1 : 0);
