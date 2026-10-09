import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page =
  context.pages().find((p) => p.url().includes("thryco.com")) ||
  context.pages()[0];
const cookies = await context.cookies();
const hasAuth = cookies.some(
  (c) => /sb-.*-auth-token/i.test(c.name) && c.value.length > 40,
);
const rzp = await page
  .locator(".razorpay-container, iframe[src*='razorpay'], iframe[src*='rzp']")
  .count();
const empty = await page
  .getByText("Your cart is empty.")
  .isVisible()
  .catch(() => false);
const frames = page
  .frames()
  .map((f) => f.url())
  .filter((u) => /razorpay|thryco/i.test(u))
  .slice(0, 5);
console.log(
  JSON.stringify(
    {
      url: page.url(),
      hasAuth,
      cartEmpty: empty,
      razorpayOpen: rzp > 0,
      frames,
    },
    null,
    2,
  ),
);
await browser.close().catch(() => undefined);
