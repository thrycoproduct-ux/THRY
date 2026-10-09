/**
 * Validate every product in stencil-collections (Kolam stencils):
 * PDP loads, options/ATC/Buy Now state, guest cart add, checkout open.
 *
 * Usage: node scripts/playwright-kolam-stencil-collection.mjs [baseUrl]
 */
import { chromium, devices } from "playwright";

const BASE = (process.argv[2] || "https://thryco.com").replace(/\/$/, "");
const COLLECTION = "/collections/stencil-collections";

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
  await page.goto(`${BASE}${COLLECTION}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(2500);

  // Collect product links from collection page (and pagination if any)
  const productHrefs = await page.evaluate(() => {
    const set = new Set();
    for (const a of document.querySelectorAll('a[href^="/shop/"]')) {
      const href = a.getAttribute("href") || "";
      const path = href.split("?")[0];
      if (path.startsWith("/shop/") && path !== "/shop") set.add(path);
    }
    return [...set];
  });

  ok(
    "Collection page has products",
    productHrefs.length > 0,
    `${productHrefs.length} products: ${productHrefs.join(", ")}`,
  );

  if (productHrefs.length === 0) {
    throw new Error("No products on stencil-collections");
  }

  for (const href of productHrefs) {
    const slug = href.replace("/shop/", "");
    console.log(`\n--- ${slug} ---`);

    // Fresh cart context per product to avoid option bleed
    const p = await context.newPage();
    try {
      await p.goto(`${BASE}${href}`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await p.waitForTimeout(2000);

      const title = (await p.locator("h1").first().textContent().catch(() => ""))
        ?.trim()
        .slice(0, 80);
      ok(`${slug}: PDP loaded`, Boolean(title), title || "no h1");

      // Size / option UI
      const optionButtons = p.locator(
        '[data-option-value], [role="radiogroup"] button, button[aria-pressed]',
      );
      const optionCount = await optionButtons.count().catch(() => 0);
      const selectOptionText = await p
        .getByText(/select (size|colour|color|option)/i)
        .count()
        .catch(() => 0);

      // Fetch size-config API from product id in page if present
      const productId = await p.evaluate(() => {
        const el = document.querySelector("[data-product-id]");
        return el?.getAttribute("data-product-id") || null;
      });

      let sizeEnabled = false;
      let sizeGroups = 0;
      if (productId) {
        const cfg = await p
          .request.get(
            `${BASE}/api/products/size-config?productId=${encodeURIComponent(productId)}`,
          )
          .then((r) => r.json())
          .catch(() => null);
        sizeEnabled = Boolean(cfg?.enabled);
        sizeGroups = Array.isArray(cfg?.groups) ? cfg.groups.length : 0;
        ok(
          `${slug}: size-config`,
          true,
          `enabled=${sizeEnabled} groups=${sizeGroups} options=${cfg?.options?.length ?? 0}`,
        );
      } else {
        ok(
          `${slug}: size-config`,
          true,
          `no data-product-id; uiOptions=${optionCount} selectCopy=${selectOptionText}`,
        );
      }

      if (sizeEnabled && optionCount > 0) {
        await optionButtons.first().click().catch(() => {});
        await p.waitForTimeout(400);
      }

      const outOfStock = await p
        .getByRole("button", { name: /out of stock/i })
        .isVisible()
        .catch(() => false);
      const atc = p.getByRole("button", { name: /add to cart/i }).first();
      const buy = p.getByRole("button", { name: /buy now/i }).first();
      const atcEnabled = await atc.isEnabled().catch(() => false);
      const buyEnabled = await buy.isEnabled().catch(() => false);

      ok(
        `${slug}: purchase buttons`,
        !outOfStock && (atcEnabled || buyEnabled),
        outOfStock
          ? "OUT OF STOCK"
          : `atc=${atcEnabled} buyNow=${buyEnabled}`,
      );

      if (outOfStock) {
        await p.close();
        continue;
      }

      // Guest Buy Now should open address/checkout path without login
      if (buyEnabled) {
        await buy.click();
        await p.waitForTimeout(2000);
        const dialog = await p.getByRole("dialog").isVisible().catch(() => false);
        const onCart = p.url().includes("/cart");
        const loginFail = await p
          .getByText(/login failed|could not sign in|sign-in failed|google sign-in failed/i)
          .isVisible()
          .catch(() => false);
        ok(
          `${slug}: Buy Now guest path`,
          (dialog || onCart) && !loginFail,
          dialog
            ? "address dialog"
            : onCart
              ? "cart"
              : loginFail
                ? "LOGIN ERROR"
                : `url=${p.url()}`,
        );

        if (dialog) {
          await p.keyboard.press("Escape").catch(() => {});
        }
      } else if (atcEnabled) {
        await atc.click();
        await p.waitForTimeout(1500);
        await p.goto(`${BASE}/cart`, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await p.waitForTimeout(2000);
        const empty = await p
          .getByText("Your cart is empty.")
          .isVisible()
          .catch(() => false);
        ok(`${slug}: ATC reaches cart`, !empty, empty ? "empty cart" : "has line");

        const pin = p.locator("#cart-delivery-pincode");
        if (await pin.count()) {
          await pin.fill("600001");
          await p.waitForTimeout(1500);
        }

        const optionToast = p.getByText("Select option in cart", {
          exact: false,
        });
        const toastWait = optionToast
          .waitFor({ timeout: 2500 })
          .then(() => true)
          .catch(() => false);
        await p.getByRole("button", { name: /check out/i }).click();
        const sawOptionToast = await toastWait;
        const dialog = await p.getByRole("dialog").isVisible().catch(() => false);
        ok(
          `${slug}: Checkout opens`,
          dialog && !sawOptionToast,
          sawOptionToast
            ? "blocked by Select option toast"
            : dialog
              ? "dialog ok"
              : "no dialog",
        );
      }
    } catch (err) {
      ok(
        `${slug}: script error`,
        false,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      await p.close().catch(() => {});
    }
  }
} catch (err) {
  ok("Suite error", false, err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log("\n=== KOLAM STENCIL COLLECTION SUMMARY ===");
  console.log(
    JSON.stringify(
      {
        base: BASE,
        collection: COLLECTION,
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
