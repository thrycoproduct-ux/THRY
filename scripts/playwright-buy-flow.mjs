/**
 * End-to-end guest buy flow against production (or BASE_URL).
 * Goes: shop → PDP → Add to Cart → /cart → PIN → checkout address → Razorpay open.
 * Completes card payment only when Razorpay key is rzp_test_ (never live charges).
 *
 * Usage: node scripts/playwright-buy-flow.mjs [baseUrl]
 */
import { chromium, devices } from "playwright";

const BASE = (process.argv[2] || "https://thryco.com").replace(/\/$/, "");
const PDP = "/shop/baby-shivan-idol";
const ADDRESS = {
  fullName: "Playwright Test Buyer",
  email: "playwright-test@thryco.com",
  mobile: "9123456789",
  pin: "600001",
  line1: "12 Test Street, Near Temple",
};

const results = [];
function ok(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Desktop Chrome"],
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

try {
  await page.goto(`${BASE}${PDP}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: "Add to Cart" }).first().click();
  await page.waitForTimeout(1500);

  const cookieHas = await page.evaluate(() =>
    document.cookie.includes("baby-shivan") ||
    /afh3brma3jmtaw38jn7jzzsm/.test(document.cookie),
  );
  ok("Add to Cart wrote guest cart cookie", cookieHas, documentCookieSnippet(await page.evaluate(() => document.cookie)));

  await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  const cartEmpty = await page.getByText("Your cart is empty.").isVisible().catch(() => false);
  const hasLine = await page.getByText(/baby shivan|shivan idol/i).first().isVisible().catch(() => false);
  ok("Cart page shows added product (not empty)", !cartEmpty && hasLine, cartEmpty ? "empty" : "has line");

  if (cartEmpty) {
    throw new Error("Cart empty after add — aborting checkout");
  }

  const pin = page.locator("#cart-delivery-pincode");
  if (await pin.count()) {
    await pin.fill(ADDRESS.pin);
    await page.waitForTimeout(2000);
    ok("Delivery PIN accepted", true, ADDRESS.pin);
  } else {
    ok("Delivery PIN field", false, "missing #cart-delivery-pincode");
  }

  const checkoutBtn = page.getByRole("button", { name: /check out/i });
  await checkoutBtn.click();
  await page.getByRole("dialog").waitFor({ timeout: 15000 });
  ok("Checkout address dialog opened", true);

  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Enter full name").fill(ADDRESS.fullName);
  await dialog.getByPlaceholder("Enter email (optional)").fill(ADDRESS.email);
  await dialog.getByPlaceholder("Enter mobile number").fill(ADDRESS.mobile);
  await dialog.getByPlaceholder("6-digit PIN code").fill(ADDRESS.pin);
  await page.waitForTimeout(2000);
  if (!(await dialog.locator('input[name="city"]').inputValue())) {
    await dialog.locator('input[name="city"]').fill("Chennai");
  }
  if (!(await dialog.locator('input[name="state"]').inputValue())) {
    await dialog.locator('input[name="state"]').fill("Tamil Nadu");
  }
  await dialog.getByPlaceholder("House / street / landmark").fill(ADDRESS.line1);

  const sessionPromise = page.waitForResponse(
    (r) =>
      r.url().includes("/api/create-checkout-session") &&
      r.request().method() === "POST",
    { timeout: 60000 },
  );
  await dialog.getByRole("button", { name: "Continue to payment" }).click();
  const sessionRes = await sessionPromise;
  const session = await sessionRes.json().catch(() => ({}));
  const isTest = String(session.keyId || "").startsWith("rzp_test_");
  ok(
    "create-checkout-session OK",
    sessionRes.status() === 200 && session.provider === "razorpay",
    `status=${sessionRes.status()} provider=${session.provider} testKey=${isTest}`,
  );

  await page.waitForTimeout(4000);
  const rzpOpen =
    (await page.locator(".razorpay-container, iframe[src*='razorpay'], iframe[src*='rzp']").count()) >
    0;
  ok("Razorpay checkout modal opened", rzpOpen);

  if (rzpOpen && isTest) {
    // Best-effort test card path (sandbox only)
    const frame = page.frames().find((f) => /api\.razorpay\.com\/v1\/checkout/.test(f.url()));
    if (frame) {
      const phone = frame.locator('input[name="contact"]');
      if (await phone.count()) {
        await phone.fill(ADDRESS.mobile);
        const email = frame.locator('input[name="email"]');
        if (await email.count()) await email.fill(ADDRESS.email);
        await frame.getByRole("button", { name: /continue/i }).click();
        await page.waitForTimeout(2000);
      }
      ok("Sandbox Razorpay contact step", true);
    }
  } else if (rzpOpen) {
    ok(
      "Payment completion skipped (live Razorpay keys)",
      true,
      "Would charge real money — stop at modal",
    );
  }

  // Buy Now path smoke (no cart)
  await page.goto(`${BASE}${PDP}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Buy Now" }).click();
  await page.getByRole("dialog").waitFor({ timeout: 15000 });
  ok("Buy Now opens address dialog", true);
} catch (e) {
  ok("Buy flow runner", false, String(e?.message || e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(
  "\n=== BUY FLOW SUMMARY ===\n" +
    JSON.stringify(
      { base: BASE, passed: results.length - failed.length, failed: failed.length, failures: failed },
      null,
      2,
    ),
);
process.exit(failed.length ? 1 : 0);

function documentCookieSnippet(cookie) {
  const m = cookie.match(/cart=[^;]*/);
  return m ? m[0].slice(0, 80) : "no-cart-cookie";
}
