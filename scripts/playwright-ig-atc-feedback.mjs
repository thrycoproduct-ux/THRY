/**
 * IG mobile: tap sticky Add to cart at first paint, assert the "Added to cart"
 * toast is actually visible (not under the sticky bar / IAB banner / bottom nav).
 * Usage: node scripts/playwright-ig-atc-feedback.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const PDP = "/shop/ganesha-silicon-mould-making-master-mould-with-wall-set";
const IG_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 312.0.0.0.0";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 412, height: 745 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: IG_UA,
});
const page = await ctx.newPage();
await page.goto(`${BASE}${PDP}`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(2500);

const firstPaint = await page.evaluate(() => {
  const bar = document.querySelector('[aria-label="Buy product"]');
  const r = bar?.getBoundingClientRect();
  const btn = bar?.querySelector("button");
  const br = btn?.getBoundingClientRect();
  const hit = br ? document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2) : null;
  return {
    stickyBar: !!bar,
    barBox: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) } : null,
    stickyBtnText: btn?.textContent?.trim(),
    stickyBtnTappable: !!(btn && hit && (hit === btn || btn.contains(hit))),
    dockVar: getComputedStyle(document.documentElement).getPropertyValue("--bottom-dock-height").trim(),
    igStripTop: (() => {
      const el = [...document.querySelectorAll("body *")].find(
        (e) => /open in chrome|open in browser/i.test(e.textContent || "") && e.getBoundingClientRect().height < 80 && e.children.length < 8,
      );
      const b = el?.getBoundingClientRect();
      return b ? { top: Math.round(b.top), bottom: Math.round(b.bottom) } : null;
    })(),
  };
});
console.log("first paint:", JSON.stringify(firstPaint, null, 2));

if (!firstPaint.stickyBar) {
  console.log("FAIL: sticky bar missing");
  await browser.close();
  process.exit(1);
}

await page.locator('[aria-label="Buy product"] button').first().tap();
await page.waitForTimeout(1500);

const after = await page.evaluate(() => {
  const toast = [...document.querySelectorAll('[role="status"]')].find((t) =>
    /added to cart/i.test(t.textContent || ""),
  );
  if (!toast) return { toast: null };
  const r = toast.getBoundingClientRect();
  const probe = [
    [r.left + 20, r.top + 12],
    [r.left + r.width / 2, r.top + r.height / 2],
    [r.right - 20, r.bottom - 12],
  ].map(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return toast.contains(el) || el === toast;
  });
  const viewBtn = toast.querySelector("a,button");
  const vb = viewBtn?.getBoundingClientRect();
  const vbHit = vb ? document.elementFromPoint(vb.left + vb.width / 2, vb.top + vb.height / 2) : null;
  return {
    toast: { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight },
    fullyOnScreen: r.top >= 0 && r.bottom <= window.innerHeight,
    unobstructed: probe.every(Boolean),
    viewCartTappable: !!(viewBtn && vbHit && (vbHit === viewBtn || viewBtn.contains(vbHit))),
    cartBadge: document.querySelector('[aria-label*="cart" i] [class*="badge"], a[href="/cart"] span')?.textContent?.trim(),
  };
});
console.log("after sticky tap:", JSON.stringify(after, null, 2));
await page.screenshot({ path: "C:/Users/sanjay_arun2/AppData/Local/Temp/ig-atc-feedback.png" });

const ok = after.toast && after.fullyOnScreen && after.unobstructed && after.viewCartTappable;
console.log(ok ? "PASS: add-to-cart feedback visible & tappable" : "FAIL: feedback hidden");
await browser.close();
process.exit(ok ? 0 : 1);
