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

function isPublicHtmlPath(pathname) {
  const path = pathname.toLowerCase();
  if (path === "/" || path === "") return true;
  if (path === "/shop" || path.startsWith("/shop/")) return true;
  if (path === "/collections" || path.startsWith("/collections/")) return true;
  if (path === "/featured") return true;
  return [
    "/about",
    "/contact",
    "/faq",
    "/shipping-returns",
    "/privacy-policy",
    "/payment-methods",
    "/store-policy",
    "/terms-and-conditions",
    "/terms-of-use",
  ].includes(path);
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

let failed = 0;
for (const c of cases) {
  const got = isCacheableGet(c);
  const ok = got === c.expect;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name} → ${got} (want ${c.expect})`);
  if (!ok) failed += 1;
}
process.exit(failed ? 1 : 0);
