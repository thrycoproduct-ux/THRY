/**
 * Signed-in buy flow using REAL Google Chrome (not Playwright Chromium).
 * Google blocks automated Chromium ("browser may not be secure") — CDP Chrome works.
 *
 * Usage: node scripts/playwright-signed-in-buy-flow.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = (process.argv[2] || "https://thryco.com").replace(/\/$/, "");
const PDP = "/shop/baby-shivan-idol";
const DEBUG_PORT = 9222;
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE_DIR = path.join(os.tmpdir(), "thry-pw-chrome-profile");

const ADDRESS = {
  fullName: "Signed In Test Buyer",
  email: "signed-in-test@thryco.com",
  mobile: "9123456789",
  pin: "600001",
  line1: "12 Signed In Street",
};

const results = [];
function ok(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForCdp(port, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  return false;
}

fs.mkdirSync(PROFILE_DIR, { recursive: true });

console.log("\n========================================");
console.log("  Opening REAL Google Chrome...");
console.log("  Sign in with Google in that window.");
console.log("  (Not Playwright Chromium — Google allows this)");
console.log("  Waiting up to 5 minutes after you land on THRY...");
console.log("========================================\n");

const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    `${BASE}/sign-in?from=%2Fcart`,
  ],
  { detached: true, stdio: "ignore" },
);
chrome.unref();

if (!(await waitForCdp(DEBUG_PORT))) {
  console.error("Chrome CDP did not start. Is Chrome already using port 9222?");
  process.exit(1);
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
const context = browser.contexts()[0] || (await browser.newContext());
context.setDefaultTimeout(5 * 60 * 1000);
const page = context.pages()[0] || (await context.newPage());
page.setDefaultTimeout(5 * 60 * 1000);

try {
  if (!page.url().includes("thryco.com") && !page.url().includes("accounts.google")) {
    await page.goto(`${BASE}/sign-in?from=%2Fcart`, {
      waitUntil: "domcontentloaded",
    });
  }

  // Click Google if still on sign-in
  if (/sign-in/i.test(page.url())) {
    const google = page.getByRole("button", { name: "Continue with Google" });
    if (await google.isVisible().catch(() => false)) {
      await google.click().catch(() => undefined);
    }
  }

  console.log("Waiting for you to finish Google sign-in...");
  await page.waitForURL(
    (url) => {
      const h = url.hostname;
      const p = url.pathname;
      return (
        h.includes("thryco.com") &&
        !p.includes("/sign-in") &&
        !p.includes("/auth/callback")
      );
    },
    { timeout: 5 * 60 * 1000 },
  );
  await page.waitForTimeout(2500);

  const cookies = await context.cookies();
  const hasAuth = cookies.some(
    (c) => /sb-.*-auth-token/i.test(c.name) && c.value.length > 40,
  );
  ok("Signed in (auth cookie present)", hasAuth, page.url());

  await page.goto(`${BASE}/setting/account`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  ok("Account settings reachable", page.url().includes("/setting"), page.url());

  await page.goto(`${BASE}${PDP}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add to Cart" }).first().click();
  await page.waitForTimeout(1500);
  ok("Add to Cart while signed in", true);

  await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const empty = await page
    .getByText("Your cart is empty.")
    .isVisible()
    .catch(() => false);
  ok("Cart has product while signed in", !empty);

  if (!empty) {
    const pin = page.locator("#cart-delivery-pincode");
    if (await pin.count()) {
      await pin.fill(ADDRESS.pin);
      await page.waitForTimeout(2000);
    }

    await page.getByRole("button", { name: /check out/i }).click();
    await page.getByRole("dialog").waitFor({ timeout: 20000 });
    ok("Checkout dialog opened (signed in)", true);

    const dialog = page.getByRole("dialog");
    const addNew = dialog.getByRole("button", { name: /add new address/i });
    if (await addNew.isVisible().catch(() => false)) {
      await addNew.click();
      await page.waitForTimeout(500);
    }

    const nameField = dialog.getByPlaceholder("Enter full name");
    if (await nameField.isVisible().catch(() => false)) {
      await nameField.fill(ADDRESS.fullName);
      await dialog
        .getByPlaceholder("Enter email (optional)")
        .fill(ADDRESS.email)
        .catch(() => undefined);
      await dialog.getByPlaceholder("Enter mobile number").fill(ADDRESS.mobile);
      await dialog.getByPlaceholder("6-digit PIN code").fill(ADDRESS.pin);
      await page.waitForTimeout(2000);
      if (!(await dialog.locator('input[name="city"]').inputValue())) {
        await dialog.locator('input[name="city"]').fill("Chennai");
      }
      if (!(await dialog.locator('input[name="state"]').inputValue())) {
        await dialog.locator('input[name="state"]').fill("Tamil Nadu");
      }
      await dialog
        .getByPlaceholder("House / street / landmark")
        .fill(ADDRESS.line1);
    }

    const sessionPromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/create-checkout-session") &&
        r.request().method() === "POST",
      { timeout: 60000 },
    );
    await dialog.getByRole("button", { name: /continue to payment/i }).click();
    const sessionRes = await sessionPromise;
    const body = await sessionRes.json().catch(() => ({}));
    ok(
      "Signed-in checkout session",
      sessionRes.status() === 200 && body.provider === "razorpay",
      `status=${sessionRes.status()} provider=${body.provider}`,
    );
    await page.waitForTimeout(4000);
    const rzp =
      (await page
        .locator(
          ".razorpay-container, iframe[src*='razorpay'], iframe[src*='rzp']",
        )
        .count()) > 0;
    ok("Razorpay opens after signed-in checkout", rzp);
  }
} catch (e) {
  ok("Signed-in buy flow", false, String(e?.message || e));
} finally {
  console.log("\nDone — you can close the Chrome window.");
  try {
    await browser.close();
  } catch {
    /* ignore */
  }
}

const failed = results.filter((r) => !r.pass);
console.log(
  "\n=== SIGNED-IN BUY SUMMARY ===\n" +
    JSON.stringify(
      {
        base: BASE,
        passed: results.filter((r) => r.pass).length,
        failed: failed.length,
        results,
      },
      null,
      2,
    ),
);
process.exit(failed.length ? 1 : 0);
