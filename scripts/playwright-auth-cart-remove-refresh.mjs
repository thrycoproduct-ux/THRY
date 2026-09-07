/**
 * Auth cart remove → refresh must stay empty (no cookie resurrection).
 *
 * Always runs a logic check (mirrors shouldShowGuestCart).
 * Optional CDP signed-in flow: THRY_CART_CDP=1 node scripts/playwright-auth-cart-remove-refresh.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = (process.argv[2] || "https://thryco.com").replace(/\/$/, "");
const RUN_CDP = process.env.THRY_CART_CDP === "1";
const PDP = "/shop/baby-shivan-idol";
const DEBUG_PORT = 9223;
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE_DIR = path.join(os.tmpdir(), "thry-pw-cart-remove-profile");

const results = [];
function ok(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail || "") });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Keep in sync with src/features/carts/guest-cart-merge.ts shouldShowGuestCart */
function shouldShowGuestCart({ activeUserId, guestHasLines, userCartHasLines }) {
  if (activeUserId) return false;
  return guestHasLines || !userCartHasLines;
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

function runLogicCheck() {
  ok(
    "logic: auth + empty DB + stale cookie → no guest cart",
    shouldShowGuestCart({
      activeUserId: "user-1",
      userCartHasLines: false,
      guestHasLines: true,
    }) === false,
  );
  ok(
    "logic: guest + cookie lines → guest cart",
    shouldShowGuestCart({
      activeUserId: null,
      userCartHasLines: false,
      guestHasLines: true,
    }) === true,
  );
  ok(
    "logic: auth with DB lines → no guest cart",
    shouldShowGuestCart({
      activeUserId: "user-1",
      userCartHasLines: true,
      guestHasLines: false,
    }) === false,
  );
}

async function runCdpSignedInFlow() {
  const { chromium } = await import("playwright");
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  console.log("\nOpen Chrome, sign in with Google, then the script continues...\n");

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
    ok("CDP Chrome started", false, "port not ready");
    return;
  }

  const browser = await chromium.connectOverCDP(
    `http://127.0.0.1:${DEBUG_PORT}`,
  );
  const context = browser.contexts()[0] || (await browser.newContext());
  context.setDefaultTimeout(5 * 60 * 1000);
  const page = context.pages()[0] || (await context.newPage());

  try {
    if (/sign-in/i.test(page.url())) {
      const google = page.getByRole("button", { name: "Continue with Google" });
      if (await google.isVisible().catch(() => false)) {
        await google.click().catch(() => undefined);
      }
    }

    await page.waitForURL(
      (url) =>
        url.hostname.includes("thryco.com") &&
        !url.pathname.includes("/sign-in") &&
        !url.pathname.includes("/auth/callback"),
      { timeout: 5 * 60 * 1000 },
    );
    await page.waitForTimeout(2000);

    const cookies = await context.cookies();
    const hasAuth = cookies.some(
      (c) => /sb-.*-auth-token/i.test(c.name) && c.value.length > 40,
    );
    ok("signed in", hasAuth);

    await page.goto(`${BASE}${PDP}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /add to cart/i }).first().click();
    await page.waitForTimeout(2000);

    await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const emptyBefore = await page
      .getByText(/your cart is empty/i)
      .isVisible()
      .catch(() => false);
    ok("cart has item after add", !emptyBefore);

    if (!emptyBefore) {
      await page.getByRole("button", { name: /remove item/i }).first().click();
      await page.waitForTimeout(2500);
    }

    const emptyAfterRemove = await page
      .getByText(/your cart is empty/i)
      .isVisible()
      .catch(() => false);
    const continueShopping = await page
      .getByRole("link", { name: /continue shopping/i })
      .first()
      .isVisible()
      .catch(() => false);
    ok(
      "empty after remove (Continue shopping)",
      emptyAfterRemove || continueShopping,
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const emptyAfterRefresh = await page
      .getByText(/your cart is empty/i)
      .isVisible()
      .catch(() => false);
    const stillContinue = await page
      .getByRole("link", { name: /continue shopping/i })
      .first()
      .isVisible()
      .catch(() => false);
    ok(
      "still empty after refresh (no resurrection)",
      emptyAfterRefresh || stillContinue,
      page.url(),
    );
  } finally {
    await browser.close().catch(() => undefined);
  }
}

runLogicCheck();
if (RUN_CDP) {
  await runCdpSignedInFlow();
} else {
  console.log(
    "\n(Skip CDP signed-in flow — set THRY_CART_CDP=1 to run interactive remove→refresh)\n",
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
