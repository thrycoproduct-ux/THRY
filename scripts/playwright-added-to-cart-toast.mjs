/**
 * Validate add-to-cart confirmation: toast near cart + View cart CTA.
 * Usage: node scripts/playwright-added-to-cart-toast.mjs [baseUrl]
 */
import { chromium, devices } from "playwright";

const BASE = (process.argv[2] || "https://thryco.com").replace(/\/$/, "");
const PDP = "/shop/baby-shivan-idol";

const results = [];
function ok(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail || "") });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
}

async function runViewport(label, contextOptions) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${PDP}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(1500);

    // Dismiss option prompts if needed — try Add to Cart / basket
    const addBtn = page.getByRole("button", { name: /add to cart/i }).first();
    if (await addBtn.count()) {
      // Select first option tile if present
      const option = page.locator("button").filter({ hasText: /^[A-Z0-9]/+$/ }).first();
      if (await option.isVisible().catch(() => false)) {
        await option.click().catch(() => undefined);
      }
      await addBtn.click();
    } else {
      await page.getByRole("button", { name: /add to cart/i }).click();
    }

    const toast = page.getByText("Added to cart", { exact: true });
    await toast.waitFor({ timeout: 8000 });
    ok(`${label}: shows Added to cart`, await toast.isVisible());

    const viewCart = page.getByRole("link", { name: /view cart/i });
    ok(`${label}: View cart CTA`, await viewCart.isVisible());

    const box = await page
      .locator("[data-radix-collection-item], li[role='status'], ol li")
      .filter({ hasText: "Added to cart" })
      .first()
      .boundingBox()
      .catch(() => null);

    if (box && contextOptions.viewport) {
      const vh = contextOptions.viewport.height;
      if (label === "mobile") {
        ok(
          `${label}: toast in lower half (near cart tab)`,
          box.y > vh * 0.45,
          `y=${Math.round(box.y)} vh=${vh}`,
        );
      } else {
        ok(
          `${label}: toast in upper half (near header bag)`,
          box.y < vh * 0.45,
          `y=${Math.round(box.y)} vh=${vh}`,
        );
      }
    } else {
      ok(`${label}: toast position measured`, false, "no bbox");
    }

    await viewCart.click();
    await page.waitForTimeout(1500);
    ok(`${label}: View cart → /cart`, page.url().includes("/cart"));
  } catch (e) {
    ok(`${label}: flow`, false, String(e).slice(0, 180));
  } finally {
    await browser.close();
  }
}

// Against current production until deploy; still useful after push.
await runViewport("mobile", { ...devices["iPhone 13"] });
await runViewport("desktop", {
  viewport: { width: 1280, height: 800 },
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
});

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
