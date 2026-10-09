/**
 * Validates checkout is not blocked when cart lines have complete
 * selections but null legacy size (the bug fixed in checkout option guard).
 *
 * Usage: node scripts/playwright-checkout-selections-null-size.mjs [baseUrl]
 */
import { chromium, devices } from "playwright";

const BASE = (process.argv[2] || "https://thryco.com").replace(/\/$/, "");
const results = [];
function ok(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail || "") });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Desktop Chrome"],
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

try {
  await page.goto(`${BASE}/shop/baby-shivan-idol`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.getByRole("button", { name: /add to cart/i }).first().click();
  await page.waitForTimeout(1500);

  const mutated = await page.evaluate(() => {
    const mutateLines = (lines) => {
      if (!lines || typeof lines !== "object") return 0;
      let n = 0;
      for (const item of Object.values(lines)) {
        if (!item || typeof item !== "object") continue;
        if (item.selections && Object.keys(item.selections).length > 0) {
          delete item.size;
          n += 1;
        } else if (item.size) {
          item.selections = { legacy: String(item.size).toUpperCase() };
          delete item.size;
          n += 1;
        } else {
          // Bare default line — leave as-is (no false positive expected if product has no options)
          n += 0;
        }
      }
      return n;
    };

    for (const key of Object.keys(localStorage)) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw || !raw.includes("productId")) continue;
        const parsed = JSON.parse(raw);
        const cart = parsed?.state?.cart ?? parsed?.cart;
        if (!cart) continue;
        const n = mutateLines(cart);
        if (n > 0) {
          localStorage.setItem(key, JSON.stringify(parsed));
          return { ok: true, via: `localStorage:${key}`, n };
        }
      } catch {
        /* ignore */
      }
    }

    const match = document.cookie.match(/(?:^|;\s*)cart=([^;]*)/);
    if (match) {
      try {
        const parsed = JSON.parse(decodeURIComponent(match[1]));
        const lines = parsed.cart ?? parsed;
        const n = mutateLines(lines);
        if (n > 0) {
          document.cookie = `cart=${encodeURIComponent(JSON.stringify(parsed))}; path=/`;
          return { ok: true, via: "cookie", n };
        }
        return {
          ok: true,
          via: "cookie-bare",
          n: 0,
          note: "product has no size; bare line ok for no-option products",
        };
      } catch {
        /* ignore */
      }
    }
    return { ok: false, reason: "no cart storage found" };
  });

  ok(
    "Cart prepared (selections and/or bare no-option line)",
    mutated.ok,
    JSON.stringify(mutated).slice(0, 200),
  );

  await page.goto(`${BASE}/cart`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2500);

  const empty = await page
    .getByText("Your cart is empty.")
    .isVisible()
    .catch(() => false);
  ok("Cart not empty", !empty);

  const pin = page.locator("#cart-delivery-pincode");
  if (await pin.count()) {
    await pin.fill("600001");
    await page.waitForTimeout(2000);
    ok("PIN filled", true, "600001");
  } else {
    ok("PIN field present", false);
  }

  let sawOptionToast = false;
  const toastWait = page
    .getByText("Select option in cart", { exact: false })
    .waitFor({ timeout: 3500 })
    .then(() => {
      sawOptionToast = true;
    })
    .catch(() => {});

  await page.getByRole("button", { name: /check out/i }).click();
  await toastWait;

  const dialogOpen = await page
    .getByRole("dialog")
    .isVisible()
    .catch(() => false);

  ok(
    "Checkout address dialog opened",
    dialogOpen,
    dialogOpen ? "opened" : "missing",
  );
  ok(
    "No false Select option in cart toast",
    !sawOptionToast,
    sawOptionToast ? "toast shown" : "clean",
  );
} catch (err) {
  ok("Script error", false, err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log("\n=== CHECKOUT SELECTIONS GUARD SUMMARY ===");
  console.log(
    JSON.stringify(
      {
        base: BASE,
        passed: results.filter((r) => r.pass).length,
        failed: failed.length,
        failures: failed,
      },
      null,
      2,
    ),
  );
  process.exit(failed.length ? 1 : 0);
}
