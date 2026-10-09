/**
 * Validates Shopify-style PDP conversion chrome:
 * - Sticky Add to cart visible on mobile first paint when buy box is below fold
 * - In-app browser prompt is a top strip (not bottom sheet covering buy zone)
 *
 * Usage:
 *   THRY_BASE_URL=http://localhost:3000 node scripts/playwright-pdp-sticky-atc.mjs
 *   THRY_BASE_URL=https://thryco.com node scripts/playwright-pdp-sticky-atc.mjs
 */
import { chromium, devices } from "playwright";

const BASE = (process.env.THRY_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const SLUG =
  process.env.THRY_PDP_SLUG ||
  "shivan-silicon-mould-making-master-mould-with-wall-set";
const URL = `${BASE}/shop/${SLUG}`;

const IG_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 312.0.0.0.0";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    userAgent: IG_UA,
  });
  const page = await context.newPage();

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  const result = await page.evaluate(() => {
    const sticky = document.querySelector('[aria-label="Buy product"]');
    const stickyText = sticky?.textContent ?? "";
    const stickyRect = sticky?.getBoundingClientRect();
    const buyBox = document.getElementById("product-buy-box");
    const buyBoxRect = buyBox?.getBoundingClientRect();
    const buyBoxInView =
      !!buyBoxRect &&
      buyBoxRect.top < window.innerHeight * 0.9 &&
      buyBoxRect.bottom > window.innerHeight * 0.1;

    // Browse banner should be top strip under header, not bottom sheet
    const statusEls = [...document.querySelectorAll('[role="status"]')];
    const bannerInfo = statusEls.map((el) => {
      const r = el.getBoundingClientRect();
      const text = (el.textContent || "").slice(0, 120);
      return {
        text,
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        nearBottom: r.bottom > window.innerHeight - 120,
      };
    });

    const bottomSheet =
      bannerInfo.find(
        (b) =>
          /Open in (your )?browser|smoother checkout|Open in Chrome/i.test(
            b.text,
          ) && b.nearBottom && b.height > 100,
      ) ?? null;

    const topStrip =
      bannerInfo.find(
        (b) =>
          /Open in browser|smoother checkout/i.test(b.text) &&
          b.top < 180 &&
          b.height <= 72,
      ) ?? null;

    return {
      stickyVisible: !!sticky && stickyRect && stickyRect.height > 0,
      stickyHasAtc: /Add to cart/i.test(stickyText),
      stickyHasPrice: /₹|Rs|INR|\d/.test(stickyText),
      stickyBottom: stickyRect ? Math.round(stickyRect.bottom) : null,
      buyBoxInView,
      bottomSheetCoveringBuy: !!bottomSheet,
      topStripOk: !!topStrip || bannerInfo.length === 0,
      bannerInfo,
      viewportH: window.innerHeight,
    };
  });

  const checks = [
    {
      name: "sticky ATC region visible on first paint",
      ok: result.stickyVisible && result.stickyHasAtc,
    },
    {
      name: "sticky shows price signal",
      ok: result.stickyHasPrice,
    },
    {
      name: "no large bottom Open-in-Chrome sheet covering buy zone",
      ok: !result.bottomSheetCoveringBuy,
    },
  ];

  console.log(JSON.stringify({ url: URL, result, checks }, null, 2));

  const failed = checks.filter((c) => !c.ok);
  await browser.close();
  if (failed.length) {
    console.error(
      "FAILED:",
      failed.map((f) => f.name).join("; "),
    );
    process.exit(1);
  }
  console.log("OK: PDP sticky ATC + browse banner layout");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
