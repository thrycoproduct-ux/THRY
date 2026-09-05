/**
 * Industry-style mobile validation for THRY.
 * Devices: iPhone SE, iPhone 13, Pixel 7
 * Covers: routes, touch UI, CDN, buy-to-Razorpay, horizontal overflow, tap targets.
 *
 * Usage: node scripts/playwright-validate-mobile.mjs [baseUrl]
 */
import { chromium, devices } from "playwright";

const BASE = (process.argv[2] || "https://thryco.com").replace(/\/$/, "");
const PDP = "/shop/baby-shivan-idol";

const DEVICE_LIST = [
  { name: "iPhone SE", descriptor: devices["iPhone SE"] },
  { name: "iPhone 13", descriptor: devices["iPhone 13"] },
  { name: "Pixel 7", descriptor: devices["Pixel 7"] },
];

const ROUTES = [
  "/",
  "/shop",
  "/featured",
  "/collections",
  "/cart",
  "/about",
  "/contact",
  "/faq",
  "/sign-in",
  PDP,
];

const results = [];
function ok(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function isNoise(text) {
  return /cloudflareinsights|Content Security Policy|auth\/v1\/user|localhost:\d+|Permissions policy|x-rtb-fingerprint|React DevTools|status of 403|Failed to fetch.*supabase|supabase\.co|Refused to get unsafe header|request-id|net::ERR_|AbortError/i.test(
    String(text || ""),
  );
}

async function pagespeedMobile(url) {
  console.log("\n=== PageSpeed Insights (mobile lab) ===");
  try {
    const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo`;
    const res = await fetch(api);
    if (!res.ok) {
      // Quota / transient API errors should not fail the mobile product suite.
      ok(
        "PageSpeed API",
        true,
        `SKIPPED HTTP ${res.status} (use Playwright LCP / retry later)`,
      );
      return null;
    }
    const data = await res.json();
    const cats = data.lighthouseResult?.categories || {};
    const audits = data.lighthouseResult?.audits || {};
    const score = (k) =>
      cats[k]?.score == null ? null : Math.round(cats[k].score * 100);
    const ms = (id) =>
      audits[id]?.numericValue != null
        ? Math.round(audits[id].numericValue)
        : null;
    const report = {
      performance: score("performance"),
      accessibility: score("accessibility"),
      bestPractices: score("best-practices"),
      seo: score("seo"),
      lcpMs: ms("largest-contentful-paint"),
      fcpMs: ms("first-contentful-paint"),
      cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
      tbtMs: ms("total-blocking-time"),
      speedIndexMs: ms("speed-index"),
    };
    // Industry CWV lab targets (mobile): LCP <= 2500, CLS <= 0.1
    ok(
      "PSI mobile Performance score",
      report.performance != null,
      String(report.performance),
    );
    ok(
      "PSI mobile LCP <= 2.5s (lab)",
      report.lcpMs != null && report.lcpMs <= 2500,
      `${report.lcpMs}ms (good ≤2500, needs-improvement ≤4000)`,
    );
    ok(
      "PSI mobile CLS <= 0.1",
      report.cls != null && report.cls <= 0.1,
      String(report.cls),
    );
    ok(
      "PSI Accessibility",
      report.accessibility != null && report.accessibility >= 80,
      String(report.accessibility),
    );
    ok(
      "PSI SEO",
      report.seo != null && report.seo >= 80,
      String(report.seo),
    );
    ok(
      "PSI Best Practices",
      report.bestPractices != null && report.bestPractices >= 70,
      String(report.bestPractices),
    );
    console.log(JSON.stringify(report, null, 2));
    return report;
  } catch (e) {
    ok("PageSpeed API", false, String(e?.message || e));
    return null;
  }
}

async function validateDevice(browser, device) {
  console.log(`\n=== Device: ${device.name} ===`);
  const context = await browser.newContext({
    ...device.descriptor,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !isNoise(msg.text())) {
      consoleErrors.push(msg.text().slice(0, 120));
    }
  });

  // Routes
  for (const path of ROUTES) {
    const res = await page.goto(`${BASE}${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(900);
    const status = res?.status() ?? 0;
    const broken = await page.evaluate(() =>
      [...document.images]
        .filter(
          (img) =>
            img.src &&
            img.complete &&
            img.naturalWidth === 0 &&
            !img.src.startsWith("data:"),
        )
        .map((i) => i.src)
        .slice(0, 3),
    );
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    const html = await page.content();
    const cdn = (html.match(/media\.thryco\.com\/cdn\//g) || []).length;
    ok(
      `${device.name} ${path} loads`,
      status >= 200 && status < 400,
      `status=${status}`,
    );
    ok(`${device.name} ${path} no broken images`, broken.length === 0, broken.join(" | ") || "0");
    ok(`${device.name} ${path} no horizontal overflow`, !overflowX);
    if (path === "/" || path === "/shop" || path.startsWith("/shop/")) {
      ok(`${device.name} ${path} CDN images`, cdn >= 1 || path === "/cart", `cdn=${cdn}`);
    }
  }

  // Mobile nav / search presence on home
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const hasMobileNav = await page
    .locator('nav, [aria-label*="menu" i], button:has-text("Menu"), a[href="/cart"]')
    .count();
  ok(`${device.name} mobile chrome present`, hasMobileNav > 0, `nodes=${hasMobileNav}`);

  // Tap targets on home CTA-ish controls
  const smallTaps = await page.evaluate(() => {
    const els = [
      ...document.querySelectorAll("a, button"),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      if (r.bottom < 0 || r.top > innerHeight) return false;
      return r.width < 40 || r.height < 40;
    });
    return els.slice(0, 5).map((el) => {
      const r = el.getBoundingClientRect();
      return `${(el.textContent || el.getAttribute("aria-label") || el.tagName)
        .trim()
        .slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    });
  });
  // Soft check: warn via FAIL only if many tiny controls in viewport
  ok(
    `${device.name} tap targets mostly OK`,
    smallTaps.length <= 8,
    smallTaps.length ? `small=${smallTaps.length} e.g. ${smallTaps[0]}` : "ok",
  );

  // Buy flow on primary phone only (iPhone 13)
  if (device.name === "iPhone 13") {
    console.log(`\n--- ${device.name} buy flow ---`);
    await page.goto(`${BASE}${PDP}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Add to Cart" }).first().tap();
    await page.waitForTimeout(1200);
    await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const empty = await page
      .getByText("Your cart is empty.")
      .isVisible()
      .catch(() => false);
    ok(`${device.name} cart after add`, !empty);
    if (!empty) {
      const pin = page.locator("#cart-delivery-pincode");
      if (await pin.count()) {
        await pin.tap();
        await pin.fill("600001");
        await page.waitForTimeout(2000);
      }
      await page.getByRole("button", { name: /check out/i }).first().tap();
      await page.getByRole("dialog").waitFor({ timeout: 15000 });
      const dialog = page.getByRole("dialog");
      await dialog.getByPlaceholder("Enter full name").fill("Mobile Test Buyer");
      await dialog
        .getByPlaceholder("Enter email (optional)")
        .fill("mobile-test@thryco.com");
      await dialog.getByPlaceholder("Enter mobile number").fill("9123456789");
      await dialog.getByPlaceholder("6-digit PIN code").fill("600001");
      await page.waitForTimeout(2000);
      if (!(await dialog.locator('input[name="city"]').inputValue())) {
        await dialog.locator('input[name="city"]').fill("Chennai");
      }
      if (!(await dialog.locator('input[name="state"]').inputValue())) {
        await dialog.locator('input[name="state"]').fill("Tamil Nadu");
      }
      await dialog
        .getByPlaceholder("House / street / landmark")
        .fill("12 Mobile Street");

      const sessionPromise = page.waitForResponse(
        (r) =>
          r.url().includes("/api/create-checkout-session") &&
          r.request().method() === "POST",
        { timeout: 60000 },
      );
      await dialog.getByRole("button", { name: /continue to payment/i }).tap();
      const sessionRes = await sessionPromise;
      const body = await sessionRes.json().catch(() => ({}));
      ok(
        `${device.name} checkout session`,
        sessionRes.status() === 200 && body.provider === "razorpay",
        `status=${sessionRes.status()}`,
      );
      await page.waitForTimeout(4000);
      const rzp =
        (await page
          .locator(
            ".razorpay-container, iframe[src*='razorpay'], iframe[src*='rzp']",
          )
          .count()) > 0;
      ok(`${device.name} Razorpay opens`, rzp);
    }

    // Fresh page for lab LCP (checkout/Razorpay can leave the buy page noisy)
    const lcpPage = await context.newPage();
    await lcpPage.addInitScript(() => {
      window.__thryLcp = null;
      try {
        const po = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const latest = entries[entries.length - 1];
          if (latest) {
            window.__thryLcp = {
              ms: Math.round(latest.startTime),
              url: String(latest.url || "").slice(0, 80),
            };
          }
        });
        po.observe({ type: "largest-contentful-paint", buffered: true });
      } catch {
        /* unsupported */
      }
    });
    await lcpPage.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 });
    await lcpPage.waitForTimeout(4000);
    const lcp = await lcpPage.evaluate(() => {
      if (window.__thryLcp?.ms) return window.__thryLcp;
      const entries = performance.getEntriesByType("largest-contentful-paint");
      const latest = entries[entries.length - 1];
      return latest
        ? {
            ms: Math.round(latest.startTime),
            url: String(latest.url || "").slice(0, 80),
          }
        : null;
    });
    await lcpPage.close();
    ok(
      `${device.name} home LCP measured`,
      !!lcp?.ms,
      lcp ? `${lcp.ms}ms ${lcp.url || ""}`.trim() : "none",
    );
    ok(
      `${device.name} home LCP <= 2.5s (lab)`,
      !!lcp && lcp.ms <= 2500,
      lcp ? `${lcp.ms}ms` : "n/a",
    );
  }

  ok(
    `${device.name} no critical console errors`,
    consoleErrors.length === 0,
    consoleErrors.slice(0, 2).join(" | ") || "0",
  );

  await context.close();
}

const psi = await pagespeedMobile(BASE);

const browser = await chromium.launch({ headless: true });
try {
  for (const device of DEVICE_LIST) {
    await validateDevice(browser, device);
  }
} catch (e) {
  ok("Mobile suite runner", false, String(e?.message || e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log("\n=== MOBILE VALIDATION SUMMARY ===");
console.log(
  JSON.stringify(
    {
      base: BASE,
      passed: results.length - failed.length,
      failed: failed.length,
      total: results.length,
      failures: failed,
      psi,
      industryNote:
        "Lab PSI + multi-device Playwright smoke/e2e. Not a substitute for Field CrUX, real devices, or paid-order QA.",
    },
    null,
    2,
  ),
);
process.exit(failed.length ? 1 : 0);
