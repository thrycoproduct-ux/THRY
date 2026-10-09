/**
 * Validate acrylic-stands-and-board-collections products (options + Buy Now).
 * Usage: node scripts/playwright-acrylic-collection.mjs [baseUrl]
 */
import { chromium, devices } from "playwright";

const BASE = (process.argv[2] || "https://thryco.com").replace(/\/$/, "");
const COLLECTION = "/collections/acrylic-stands-and-board-collections";

const results = [];
function log(row) {
  results.push(row);
  console.log(JSON.stringify(row));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Desktop Chrome"],
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

await page.goto(`${BASE}${COLLECTION}`, {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(2500);

const hrefs = await page.evaluate(() => {
  const set = new Set();
  for (const a of document.querySelectorAll('a[href^="/shop/"]')) {
    const path = (a.getAttribute("href") || "").split("?")[0];
    if (path.startsWith("/shop/") && path !== "/shop") set.add(path);
  }
  return [...set];
});

console.log(`acrylic products ${hrefs.length}`);

for (const href of hrefs) {
  const p = await context.newPage();
  try {
    await p.goto(`${BASE}${href}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await p.waitForTimeout(1500);
    const title = (
      await p.locator("h1").first().textContent().catch(() => "")
    )?.trim();
    const pid = await p.evaluate(
      () =>
        document.querySelector("[data-product-id]")?.getAttribute(
          "data-product-id",
        ) || null,
    );
    let cfg = null;
    if (pid) {
      const res = await p.request.get(
        `${BASE}/api/products/size-config?productId=${encodeURIComponent(pid)}`,
      );
      cfg = await res.json();
    }
    const out = await p
      .getByRole("button", { name: /out of stock/i })
      .isVisible()
      .catch(() => false);
    let atc = await p
      .getByRole("button", { name: /add to cart/i })
      .first()
      .isEnabled()
      .catch(() => false);
    let buy = await p
      .getByRole("button", { name: /buy now/i })
      .first()
      .isEnabled()
      .catch(() => false);
    const optionLocator = p.locator(
      "[data-option-value], [role=radiogroup] button, button[aria-pressed]",
    );
    const optionCount = await optionLocator.count().catch(() => 0);
    if (cfg?.enabled && optionCount > 0) {
      await optionLocator.first().click().catch(() => {});
      await p.waitForTimeout(400);
      atc = await p
        .getByRole("button", { name: /add to cart/i })
        .first()
        .isEnabled()
        .catch(() => false);
      buy = await p
        .getByRole("button", { name: /buy now/i })
        .first()
        .isEnabled()
        .catch(() => false);
    }
    let buyPath = "skipped";
    if (!out && buy) {
      await p.getByRole("button", { name: /buy now/i }).first().click();
      await p.waitForTimeout(1800);
      const dialog = await p.getByRole("dialog").isVisible().catch(() => false);
      const login = await p
        .getByText(
          /login failed|could not sign in|google sign-in failed/i,
        )
        .isVisible()
        .catch(() => false);
      buyPath = dialog ? "dialog" : login ? "LOGIN_FAIL" : p.url();
    }
    log({
      slug: href,
      title,
      enabled: Boolean(cfg?.enabled),
      groups: (cfg?.groups || []).map((g) => ({
        name: g.name,
        opts: (g.options || []).length,
      })),
      out,
      atc,
      buy,
      buyPath,
      pass:
        !out &&
        (buyPath === "dialog" || (!buy && atc) || buyPath === "skipped"),
    });
  } catch (e) {
    log({
      slug: href,
      error: e instanceof Error ? e.message : String(e),
      pass: false,
    });
  } finally {
    await p.close().catch(() => {});
  }
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(
  JSON.stringify(
    {
      collection: COLLECTION,
      total: results.length,
      failed: failed.length,
      failures: failed,
    },
    null,
    2,
  ),
);
process.exit(failed.length ? 1 : 0);
