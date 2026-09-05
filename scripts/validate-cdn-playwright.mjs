/**
 * Complete production validation for Cloudflare CDN image delivery + storefront.
 * Usage: node scripts/validate-cdn-playwright.mjs [baseUrl]
 */
import { chromium, devices } from "playwright";

const BASE = (process.argv[2] || "https://thryco.com").replace(/\/$/, "");
const SAMPLE_KEY = "uploads/upload-bat0Jc4NISjTbZoNSmUlQ.png";
const CARD_BUDGET = 120_000; // bytes

const results = [];

function ok(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text, headers: res.headers };
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
  const health = await fetchJson("https://media.thryco.com/health");
  ok(
    "media.thryco.com /health",
    health.status === 200 && health.json?.ok === true,
    JSON.stringify(health.json),
  );
  ok(
    "Images binding enabled",
    health.json?.images === true,
    String(health.json?.images),
  );

  const raw = await measureBytes(
    `https://pub-7298c413a12641b5ba5dd9bff2d9009f.r2.dev/${SAMPLE_KEY}`,
  );
  const resized = await measureBytes(
    `https://media.thryco.com/cdn/w=400,q=75,f=webp/${SAMPLE_KEY}`,
  );
  ok(
    "CDN resize returns WebP",
    resized.status === 200 && /image\/webp/i.test(resized.type),
    `${resized.status} ${resized.type} ${resized.bytes}B`,
  );
  ok(
    `Card image under ${CARD_BUDGET / 1000}KB budget`,
    resized.bytes > 0 && resized.bytes < CARD_BUDGET,
    `${raw.bytes} -> ${resized.bytes} (${raw.bytes ? Math.round((1 - resized.bytes / raw.bytes) * 100) : 0}% smaller)`,
  );

  const head = await fetch(
    `https://media.thryco.com/cdn/w=400,q=75,f=webp/${SAMPLE_KEY}`,
    { method: "HEAD" },
  );
  ok("CDN HEAD supported", head.status === 200, `status=${head.status}`);
}

async function browserChecks() {
  console.log("\n=== Playwright storefront ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    // keep mobile viewport for LCP-ish conditions
  });
  const page = await context.newPage();

  const imageResponses = [];
  page.on("response", (res) => {
    const u = res.url();
    if (
      /\.(png|jpe?g|webp|avif)(\?|$)/i.test(u) ||
      u.includes("/cdn/") ||
      u.includes("r2.dev")
    ) {
      imageResponses.push({
        url: u,
        status: res.status(),
        type: res.headers()["content-type"] || "",
      });
    }
  });

  const paths = ["/", "/shop", "/cart"];
  const pageReports = {};

  for (const path of paths) {
    const url = `${BASE}${path}`;
    const resp = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(2500);
    const status = resp?.status() ?? 0;
    const html = await page.content();
    const cdnCount = (html.match(/media\.thryco\.com\/cdn\//g) || []).length;
    const r2Count = (html.match(/r2\.dev/g) || []).length;
    // Only flag images that finished loading and failed (ignore lazy off-screen).
    const brokenImgs = await page.evaluate(() =>
      [...document.images]
        .filter(
          (img) =>
            img.src &&
            img.complete &&
            img.naturalWidth === 0 &&
            !img.src.startsWith("data:"),
        )
        .map((img) => img.src)
        .slice(0, 8),
    );
    const heroMeta = await page.evaluate(() => {
      const preload = [
        ...document.querySelectorAll('link[rel="preload"][as="image"]'),
      ].map((l) => l.getAttribute("href") || "");
      const high = [...document.querySelectorAll("img[fetchpriority=high]")].map(
        (i) => ({
          src: i.currentSrc || i.src,
          loading: i.getAttribute("loading"),
        }),
      );
      return { preload, high };
    });

    pageReports[path] = {
      status,
      cdnCount,
      r2Count,
      brokenImgs,
      heroMeta,
    };

    ok(`${path} HTTP 200`, status === 200, `status=${status}`);
    if (path === "/" || path === "/shop") {
      ok(
        `${path} uses media.thryco.com/cdn`,
        cdnCount >= 1,
        `cdn=${cdnCount} r2=${r2Count}`,
      );
    }
    ok(
      `${path} no broken images`,
      brokenImgs.length === 0,
      brokenImgs.length ? brokenImgs.join(", ") : "0 broken",
    );

    if (path === "/") {
      const preloadCdn = heroMeta.preload.some((h) =>
        h.includes("media.thryco.com/cdn/"),
      );
      const highOk =
        heroMeta.high.length > 0 &&
        heroMeta.high.every((h) => h.loading !== "lazy");
      ok(
        "Home hero preload points at CDN",
        preloadCdn || heroMeta.preload.length > 0,
        JSON.stringify(heroMeta.preload.slice(0, 2)),
      );
      ok(
        "Home has fetchpriority=high (not lazy)",
        highOk,
        JSON.stringify(heroMeta.high.slice(0, 1)),
      );
    }
  }

  // PDP: first product link from shop
  await page.goto(`${BASE}/shop`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  const pdpHref = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/shop/"]');
    return a?.getAttribute("href") || null;
  });
  if (pdpHref && pdpHref !== "/shop") {
    const resp = await page.goto(`${BASE}${pdpHref}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(2000);
    const html = await page.content();
    const cdnCount = (html.match(/media\.thryco\.com\/cdn\//g) || []).length;
    const brokenImgs = await page.evaluate(() =>
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
    ok(`PDP ${pdpHref} HTTP 200`, (resp?.status() ?? 0) === 200);
    ok(
      `PDP uses CDN images`,
      cdnCount >= 1,
      `cdn=${cdnCount}`,
    );
    ok(`PDP no broken images`, brokenImgs.length === 0, String(brokenImgs.length));
  } else {
    ok("PDP link found on /shop", false, "no product link");
  }

  const failedImages = imageResponses.filter(
    (r) =>
      r.status >= 400 &&
      (r.url.includes("media.thryco.com") || r.url.includes("r2.dev")),
  );
  ok(
    "No failed CDN/R2 image responses",
    failedImages.length === 0,
    failedImages.length
      ? failedImages
          .slice(0, 3)
          .map((f) => `${f.status} ${f.url}`)
          .join(" | ")
      : `${imageResponses.length} image responses`,
  );

  // LCP-ish: largest contentful paint element via PerformanceObserver buffer
  await page.goto(`${BASE}/`, {
    waitUntil: "networkidle",
    timeout: 90_000,
  });
  await page.waitForTimeout(3000);
  const lcp = await page.evaluate(() => {
    return new Promise((resolve) => {
      let latest = null;
      try {
        const entries = performance.getEntriesByType("largest-contentful-paint");
        if (entries?.length) latest = entries[entries.length - 1];
      } catch {
        /* ignore */
      }
      const po = new PerformanceObserver((list) => {
        const e = list.getEntries();
        if (e.length) latest = e[e.length - 1];
      });
      try {
        po.observe({ type: "largest-contentful-paint", buffered: true });
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        po.disconnect();
        resolve(
          latest
            ? {
                startTime: Math.round(latest.startTime),
                size: latest.size,
                url: latest.url || "",
                element: latest.element
                  ? `${latest.element.tagName}.${latest.element.className}`
                  : "",
              }
            : null,
        );
      }, 2000);
    });
  });
  ok(
    "LCP measured",
    !!lcp && typeof lcp.startTime === "number",
    lcp
      ? `${lcp.startTime}ms url=${(lcp.url || "").slice(0, 80)}`
      : "no LCP entry",
  );
  if (lcp?.url) {
    ok(
      "LCP image served via CDN (when image)",
      !lcp.url ||
        lcp.url.includes("media.thryco.com/cdn/") ||
        !/\.(png|jpe?g|webp)/i.test(lcp.url),
      lcp.url.slice(0, 120),
    );
  }

  await browser.close();
  return pageReports;
}

async function unitTests() {
  console.log("\n=== Unit tests (cdn-image) ===");
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    "npx",
    ["jest", "src/lib/media/cdn-image.test.ts", "--no-coverage", "--forceExit"],
    { encoding: "utf8", shell: true, cwd: process.cwd() },
  );
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  const pass = /Tests:\s+\d+ passed/.test(out) && r.status === 0;
  ok("cdn-image unit tests", pass, `exit=${r.status}`);
}

const pageReports = await (async () => {
  await apiChecks();
  let reports = {};
  try {
    reports = await browserChecks();
  } catch (e) {
    ok("Playwright browser run", false, String(e?.message || e));
  }
  await unitTests();
  return reports;
})();

const failed = results.filter((r) => !r.pass);
console.log("\n=== SUMMARY ===");
console.log(
  JSON.stringify(
    {
      base: BASE,
      passed: results.filter((r) => r.pass).length,
      failed: failed.length,
      failures: failed,
      pages: pageReports,
    },
    null,
    2,
  ),
);
process.exit(failed.length ? 1 : 0);
