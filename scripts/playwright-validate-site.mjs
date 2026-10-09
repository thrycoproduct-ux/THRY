/**
 * Full website Playwright validation for THRY storefront.
 * Covers: routes, CDN, images, nav, cart/checkout-to-Razorpay, auth pages, mobile.
 *
 * Usage: node scripts/playwright-validate-site.mjs [baseUrl]
 */
import { chromium, devices } from "playwright";

const BASE = (process.argv[2] || "https://thryco.com").replace(/\/$/, "");
const SAMPLE_KEY = "uploads/upload-bat0Jc4NISjTbZoNSmUlQ.png";
const CARD_BUDGET = 120_000;
const PDP_SLUG = "baby-shivan-idol";

const PUBLIC_ROUTES = [
  "/",
  "/shop",
  "/featured",
  "/collections",
  "/cart",
  "/wish-list",
  "/about",
  "/contact",
  "/faq",
  "/payment-methods",
  "/shipping-returns",
  "/privacy-policy",
  "/terms-and-conditions",
  "/terms-of-use",
  "/store-policy",
  "/orders",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
];

const AUTH_GATED = ["/setting", "/setting/account", "/setting/address"];

const results = [];
function ok(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function isNoiseConsole(text) {
  const t = String(text || "");
  return (
    /cloudflareinsights|beacon\.min\.js/i.test(t) ||
    /Content Security Policy/i.test(t) ||
    /auth\/v1\/user/i.test(t) ||
    /x-rtb-fingerprint-id|request-id/i.test(t) ||
    /Permissions policy violation: accelerometer/i.test(t) ||
    /localhost:\d+/i.test(t) ||
    /Failed to load resource: the server responded with a status of 403/i.test(t) ||
    /Download the React DevTools/i.test(t)
  );
}

async function measureBytes(url) {
  const res = await fetch(url);
  const buf = res.ok ? await res.arrayBuffer() : null;
  return {
    status: res.status,
    bytes: buf ? buf.byteLength : 0,
    type: res.headers.get("content-type") || "",
  };
}

async function apiChecks() {
  console.log("\n=== API / CDN ===");
  const health = await fetch("https://media.thryco.com/health").then(async (r) => ({
    status: r.status,
    json: await r.json().catch(() => null),
  }));
  ok("media /health", health.status === 200 && health.json?.ok === true, JSON.stringify(health.json));
  ok("Images binding", health.json?.images === true);

  const siteHealth = await fetch(`${BASE}/api/health`).then(async (r) => ({
    status: r.status,
    text: (await r.text()).slice(0, 120),
  }));
  ok("site /api/health", siteHealth.status === 200, siteHealth.text);

  const raw = await measureBytes(
    `https://pub-7298c413a12641b5ba5dd9bff2d9009f.r2.dev/${SAMPLE_KEY}`,
  );
  const resized = await measureBytes(
    `https://media.thryco.com/cdn/w=400,q=75,f=webp/${SAMPLE_KEY}`,
  );
  ok(
    "CDN WebP resize",
    resized.status === 200 && /image\/webp/i.test(resized.type) && resized.bytes < CARD_BUDGET,
    `${raw.bytes} -> ${resized.bytes}`,
  );
  const head = await fetch(
    `https://media.thryco.com/cdn/w=400,q=75,f=webp/${SAMPLE_KEY}`,
    { method: "HEAD" },
  );
  ok("CDN HEAD", head.status === 200, `status=${head.status}`);
}

async function checkPage(page, path, opts = {}) {
  const { expectCdn = false, allowRedirect = true } = opts;
  const consoleErrors = [];
  const onConsole = (msg) => {
    if (msg.type() === "error" && !isNoiseConsole(msg.text())) {
      consoleErrors.push(msg.text().slice(0, 160));
    }
  };
  page.on("console", onConsole);

  let status = 0;
  try {
    const res = await page.goto(`${BASE}${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    status = res?.status() ?? 0;
    await page.waitForTimeout(1200);
  } catch (e) {
    page.off("console", onConsole);
    ok(`GET ${path}`, false, String(e?.message || e).slice(0, 120));
    return null;
  }

  const html = await page.content();
  const title = await page.title();
  const broken = await page.evaluate(() =>
    [...document.images]
      .filter(
        (img) =>
          img.src &&
          img.complete &&
          img.naturalWidth === 0 &&
          !img.src.startsWith("data:"),
      )
      .map((img) => img.src)
      .slice(0, 5),
  );
  const cdn = (html.match(/media\.thryco\.com\/cdn\//g) || []).length;
  const hasMain = await page.locator("main, [role='main'], body").count();

  const statusOk = allowRedirect ? status >= 200 && status < 400 : status === 200;
  ok(`GET ${path}`, statusOk && hasMain > 0, `status=${status} title=${title.slice(0, 40)}`);
  ok(`${path} no broken images`, broken.length === 0, broken.length ? broken.join(" | ") : "0");
  if (expectCdn) {
    ok(`${path} uses CDN images`, cdn >= 1, `cdn=${cdn}`);
  }
  ok(
    `${path} no critical console errors`,
    consoleErrors.length === 0,
    consoleErrors.slice(0, 2).join(" | ") || "0",
  );

  page.off("console", onConsole);
  return { status, title, cdn, broken, path };
}

async function crawlInternalLinks(page) {
  console.log("\n=== Homepage link crawl ===");
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  const hrefs = await page.evaluate((base) => {
    const origin = new URL(base).origin;
    return [
      ...new Set(
        [...document.querySelectorAll("a[href]")]
          .map((a) => a.getAttribute("href") || "")
          .filter(Boolean)
          .map((h) => {
            try {
              const u = new URL(h, base);
              if (u.origin !== origin) return null;
              return u.pathname + u.search;
            } catch {
              return null;
            }
          })
          .filter(Boolean)
          .filter((p) => !p.startsWith("/admin") && !p.includes("mailto:")),
      ),
    ].slice(0, 40);
  }, BASE);

  ok("Homepage exposes internal links", hrefs.length >= 5, `${hrefs.length} links`);

  let fail = 0;
  for (const href of hrefs.slice(0, 25)) {
    try {
      const res = await page.goto(`${BASE}${href}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      const st = res?.status() ?? 0;
      if (st >= 400) {
        fail += 1;
        ok(`Link ${href}`, false, `status=${st}`);
      }
    } catch (e) {
      fail += 1;
      ok(`Link ${href}`, false, String(e?.message || e).slice(0, 80));
    }
  }
  if (fail === 0) {
    ok("Sampled homepage links load", true, `${Math.min(25, hrefs.length)} checked`);
  }
}

async function collectionsAndPdp(page) {
  console.log("\n=== Catalog ===");
  await page.goto(`${BASE}/collections`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const collectionHref = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/collections/"]');
    return a?.getAttribute("href") || null;
  });
  if (collectionHref && collectionHref !== "/collections") {
    const res = await page.goto(`${BASE}${collectionHref}`, {
      waitUntil: "domcontentloaded",
    });
    ok(`Collection ${collectionHref}`, (res?.status() ?? 0) === 200);
  } else {
    ok("Collection detail link", false, "none found");
  }

  await checkPage(page, `/shop/${PDP_SLUG}`, { expectCdn: true });
  await checkPage(page, "/shop", { expectCdn: true });
  await checkPage(page, "/", { expectCdn: true });
}

async function buyFlow(page) {
  console.log("\n=== Buy flow (to Razorpay) ===");
  await page.goto(`${BASE}/shop/${PDP_SLUG}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add to Cart" }).first().click();
  await page.waitForTimeout(1200);

  await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const empty = await page.getByText("Your cart is empty.").isVisible().catch(() => false);
  ok("Cart has product after add", !empty);

  if (empty) return;

  const pin = page.locator("#cart-delivery-pincode");
  if (await pin.count()) {
    await pin.fill("600001");
    await page.waitForTimeout(2000);
  }

  await page.getByRole("button", { name: /check out/i }).click();
  await page.getByRole("dialog").waitFor({ timeout: 15000 });
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Enter full name").fill("Site Validation Buyer");
  await dialog.getByPlaceholder("Enter email (optional)").fill("validate@thryco.com");
  await dialog.getByPlaceholder("Enter mobile number").fill("9123456789");
  await dialog.getByPlaceholder("6-digit PIN code").fill("600001");
  await page.waitForTimeout(2000);
  if (!(await dialog.locator('input[name="city"]').inputValue())) {
    await dialog.locator('input[name="city"]').fill("Chennai");
  }
  if (!(await dialog.locator('input[name="state"]').inputValue())) {
    await dialog.locator('input[name="state"]').fill("Tamil Nadu");
  }
  await dialog.getByPlaceholder("House / street / landmark").fill("12 Validation Street");

  const sessionPromise = page.waitForResponse(
    (r) =>
      r.url().includes("/api/create-checkout-session") &&
      r.request().method() === "POST",
    { timeout: 60000 },
  );
  await dialog.getByRole("button", { name: "Continue to payment" }).click();
  const sessionRes = await sessionPromise;
  const body = await sessionRes.json().catch(() => ({}));
  ok(
    "Checkout session created",
    sessionRes.status() === 200 && body.provider === "razorpay",
    `status=${sessionRes.status()} provider=${body.provider}`,
  );
  await page.waitForTimeout(3500);
  const rzp =
    (await page.locator(".razorpay-container, iframe[src*='razorpay'], iframe[src*='rzp']").count()) >
    0;
  ok("Razorpay modal opens", rzp);

  // dismiss overlay so later checks aren't blocked
  await page.evaluate(() => {
    document.querySelectorAll(".razorpay-container").forEach((el) => el.remove());
    document.body.style.overflow = "";
  });
}

async function mobileSmoke(browser) {
  console.log("\n=== Mobile smoke ===");
  const context = await browser.newContext({
    ...devices["iPhone 13"],
  });
  const page = await context.newPage();
  for (const path of ["/", "/shop", `/shop/${PDP_SLUG}`, "/cart"]) {
    const res = await page.goto(`${BASE}${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(1000);
    ok(`Mobile ${path}`, (res?.status() ?? 0) === 200);
  }
  await context.close();
}

async function authGated(page) {
  console.log("\n=== Auth-gated routes ===");
  for (const path of AUTH_GATED) {
    const res = await page.goto(`${BASE}${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    const status = res?.status() ?? 0;
    const url = page.url();
    // Should load or redirect to sign-in — not 5xx
    const okStatus = status > 0 && status < 500;
    const landed =
      /sign-in|sign-up|setting|account|address|forbidden/i.test(url) ||
      status === 200;
    ok(`Auth-gated ${path}`, okStatus && landed, `status=${status} url=${url.replace(BASE, "")}`);
  }
}

console.log(`\nTHRY full-site validation → ${BASE}\n`);
await apiChecks();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Desktop Chrome"],
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

try {
  console.log("\n=== Public routes ===");
  for (const path of PUBLIC_ROUTES) {
    await checkPage(page, path, {
      expectCdn: path === "/" || path === "/shop" || path === "/featured",
    });
  }

  await collectionsAndPdp(page);
  await crawlInternalLinks(page);
  await buyFlow(page);
  await authGated(page);
  await mobileSmoke(browser);
} catch (e) {
  ok("Suite runner", false, String(e?.message || e));
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
const passed = results.length - failed.length;
console.log("\n=== FULL SITE SUMMARY ===");
console.log(
  JSON.stringify(
    {
      base: BASE,
      passed,
      failed: failed.length,
      total: results.length,
      failures: failed,
    },
    null,
    2,
  ),
);
process.exit(failed.length ? 1 : 0);
