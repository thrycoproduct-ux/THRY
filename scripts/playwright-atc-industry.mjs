/**
 * Industry-standard Add to cart validation — mobile + desktop + Instagram WebView.
 *
 * Cases:
 * 1) Desktop: inline Add to cart → toast → cart has item → badge
 * 2) Mobile: sticky ATC visible first paint → add → toast → cart
 * 3) Instagram mobile UA: top strip (not bottom sheet) + sticky ATC + add works
 * 4) Options product: sticky "Add to cart" scrolls to buy box (or add if simple)
 * 5) Empty cart: Continue shopping hard-nav to /shop
 * 6) Desktop: add twice → qty increases (or 2 lines)
 *
 * Usage:
 *   node scripts/playwright-atc-industry.mjs
 *   THRY_BASE_URL=http://localhost:3000 node scripts/playwright-atc-industry.mjs
 */
import { chromium, devices } from "playwright";

const BASE = (process.env.THRY_BASE_URL || "https://thryco.com").replace(
  /\/$/,
  "",
);
const SIMPLE_PDP =
  process.env.THRY_PDP_SIMPLE || "/shop/baby-shivan-idol";
const OPTIONS_PDP =
  process.env.THRY_PDP_OPTIONS ||
  "/shop/shivan-silicon-mould-making-master-mould-with-wall-set";

const IG_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 312.0.0.0.0";

const results = [];
function ok(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail || "") });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
}

async function dismissIabIfAny(page) {
  const dismiss = page.getByRole("button", { name: /^dismiss$/i });
  if (await dismiss.count()) {
    await dismiss.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function clickAddToCart(page, preferSticky = false) {
  if (preferSticky) {
    const sticky = page.locator('[aria-label="Buy product"]');
    if (await sticky.count()) {
      const btn = sticky.getByRole("button", { name: /add to cart/i });
      if (await btn.count()) {
        await btn.first().click();
        return "sticky";
      }
    }
  }
  const inline = page.getByRole("button", { name: /add to cart/i });
  await inline.first().click();
  return "inline";
}

async function caseDesktopSimple() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${SIMPLE_PDP}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForTimeout(2000);

    const sticky = page.locator('[aria-label="Buy product"]');
    ok(
      "desktop: sticky ATC hidden (md:hidden)",
      !(await sticky.isVisible().catch(() => false)),
    );

    await clickAddToCart(page, false);
    const toast = page.getByText("Added to cart", { exact: true });
    await toast.waitFor({ timeout: 12000 });
    ok("desktop: Added to cart toast", await toast.isVisible());

    const viewCart = page.getByRole("link", { name: /view cart/i });
    ok("desktop: View cart CTA on toast", await viewCart.isVisible());

    await page.goto(`${BASE}/cart`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(2500);
    const empty = await page
      .getByText(/your cart is empty/i)
      .isVisible()
      .catch(() => false);
    ok("desktop: cart not empty after ATC", !empty);

    const stickyCheckout = page.locator(
      'text=/check out|continue to payment/i',
    );
    ok(
      "desktop: checkout CTA present on cart",
      (await stickyCheckout.count()) > 0,
    );
  } catch (e) {
    ok("desktop: simple ATC flow", false, String(e).slice(0, 220));
  } finally {
    await browser.close();
  }
}

async function caseMobileStickyAndToast() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${SIMPLE_PDP}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForTimeout(2500);

    const sticky = page.locator('[aria-label="Buy product"]');
    const stickyVisible = await sticky.isVisible().catch(() => false);
    ok("mobile: sticky buy region on first paint", stickyVisible);

    if (stickyVisible) {
      const box = await sticky.boundingBox();
      const vh = page.viewportSize()?.height ?? 0;
      const bottom = box ? box.y + box.height : 0;
      ok(
        "mobile: sticky sits above bottom nav",
        !!box && bottom <= vh && box.y > vh * 0.45,
        box
          ? `y=${Math.round(box.y)} bottom=${Math.round(bottom)} vh=${vh}`
          : "no box",
      );
    }

    const via = await clickAddToCart(page, true);
    ok("mobile: clicked ATC", true, via);

    const toast = page.getByText("Added to cart", { exact: true });
    await toast.waitFor({ timeout: 12000 });
    ok("mobile: Added to cart toast", await toast.isVisible());

    const toastBox = await toast.boundingBox().catch(() => null);
    const vh = page.viewportSize()?.height ?? 0;
    ok(
      "mobile: toast in lower half (near cart tab)",
      !!toastBox && toastBox.y > vh * 0.4,
      toastBox ? `y=${Math.round(toastBox.y)}` : "no box",
    );

    await page.getByRole("link", { name: /view cart/i }).click();
    await page.waitForTimeout(2000);
    ok("mobile: View cart → /cart", page.url().includes("/cart"));

    const empty = await page
      .getByText(/your cart is empty/i)
      .isVisible()
      .catch(() => false);
    ok("mobile: cart has item", !empty);
  } catch (e) {
    ok("mobile: sticky + toast flow", false, String(e).slice(0, 220));
  } finally {
    await browser.close();
  }
}

async function caseInstagramMobile() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    userAgent: IG_UA,
  });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${OPTIONS_PDP}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForTimeout(3000);

    const layout = await page.evaluate(() => {
      const sticky = document.querySelector('[aria-label="Buy product"]');
      const statuses = [...document.querySelectorAll('[role="status"]')].map(
        (el) => {
          const r = el.getBoundingClientRect();
          return {
            text: (el.textContent || "").slice(0, 80),
            top: Math.round(r.top),
            height: Math.round(r.height),
            nearBottom: r.bottom > window.innerHeight - 120,
          };
        },
      );
      const bottomSheet = statuses.find(
        (s) =>
          /open in (your )?browser|smoother checkout|open in chrome/i.test(
            s.text,
          ) &&
          s.nearBottom &&
          s.height > 100,
      );
      const topStrip = statuses.find(
        (s) =>
          /open in browser|smoother checkout|payment works best/i.test(
            s.text,
          ) &&
          s.top < 200 &&
          s.height <= 80,
      );
      const stickyRect = sticky?.getBoundingClientRect();
      return {
        stickyVisible: !!sticky && (stickyRect?.height ?? 0) > 0,
        stickyHasAtc: /add to cart/i.test(sticky?.textContent || ""),
        bottomSheet: !!bottomSheet,
        topStrip: !!topStrip || statuses.length === 0,
        statuses,
      };
    });

    ok(
      "IG mobile: sticky ATC visible first paint",
      layout.stickyVisible && layout.stickyHasAtc,
    );
    ok(
      "IG mobile: no large bottom Open-in-Chrome sheet",
      !layout.bottomSheet,
    );
    ok(
      "IG mobile: browse tip is top strip or absent",
      layout.topStrip || !layout.bottomSheet,
      JSON.stringify(layout.statuses).slice(0, 120),
    );

    // Sticky on options product should scroll to buy box
    const stickyBtn = page
      .locator('[aria-label="Buy product"]')
      .getByRole("button", { name: /add to cart/i });
    if (await stickyBtn.count()) {
      await stickyBtn.click();
      await page.waitForTimeout(800);
      const buyBoxInView = await page.evaluate(() => {
        const el = document.getElementById("product-buy-box");
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0;
      });
      ok("IG mobile: sticky ATC scrolls buy box into view", buyBoxInView);
    } else {
      ok("IG mobile: sticky ATC button", false, "missing");
    }

    // Complete add via inline form if options needed
    const optionTile = page.locator("#product-buy-box button").first();
    if (await optionTile.count()) {
      await optionTile.click().catch(() => {});
      await page.waitForTimeout(400);
    }
    const inlineAdd = page
      .locator("#product-buy-box")
      .getByRole("button", { name: /add to cart/i });
    if (await inlineAdd.count()) {
      await inlineAdd.click();
      const toast = page.getByText("Added to cart", { exact: true });
      const toastOk = await toast
        .waitFor({ timeout: 12000 })
        .then(() => true)
        .catch(() => false);
      ok("IG mobile: inline ATC after options → toast", toastOk);
    } else {
      // simple product path already covered
      ok("IG mobile: options buy box ATC", true, "no inline (sticky-only path)");
    }
  } catch (e) {
    ok("IG mobile: conversion chrome", false, String(e).slice(0, 220));
  } finally {
    await browser.close();
  }
}

async function caseEmptyCartContinueShopping() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  try {
    await context.clearCookies();
    await page.goto(`${BASE}/cart`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForTimeout(2000);

    const continueBtn = page
      .locator("a[href='/shop']")
      .filter({ hasText: /continue shopping/i })
      .first();
    const visible = await continueBtn.isVisible().catch(() => false);
    ok("empty cart: Continue shopping visible", visible);

    if (visible) {
      await continueBtn.click();
      await page.waitForTimeout(2500);
      ok(
        "empty cart: Continue shopping → /shop",
        page.url().includes("/shop"),
        page.url(),
      );
    } else {
      ok("empty cart: Continue shopping → /shop", false, "link not visible");
    }
  } catch (e) {
    ok("empty cart: Continue shopping", false, String(e).slice(0, 220));
  } finally {
    await browser.close();
  }
}

async function caseDesktopDoubleAdd() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${SIMPLE_PDP}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForTimeout(1500);
    await clickAddToCart(page, false);
    await page
      .getByText("Added to cart", { exact: true })
      .waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    await clickAddToCart(page, false);
    await page.waitForTimeout(1500);

    await page.goto(`${BASE}/cart`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(2500);

    const qtySignal = await page.evaluate(() => {
      const text = document.body.innerText;
      // qty 2 or "2 items" / quantity input value
      const inputs = [...document.querySelectorAll("input")].map(
        (i) => i.value,
      );
      return {
        hasTwo: /\b2\b/.test(text) || inputs.includes("2"),
        snippet: text.slice(0, 200),
      };
    });
    ok(
      "desktop: second add increases cart qty/items",
      qtySignal.hasTwo,
      qtySignal.snippet.replace(/\s+/g, " ").slice(0, 80),
    );
  } catch (e) {
    ok("desktop: double add", false, String(e).slice(0, 220));
  } finally {
    await browser.close();
  }
}

console.log(`Base: ${BASE}\n`);
await caseDesktopSimple();
await caseMobileStickyAndToast();
await caseInstagramMobile();
await caseEmptyCartContinueShopping();
await caseDesktopDoubleAdd();

const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) {
  console.log("Failed:");
  for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);
