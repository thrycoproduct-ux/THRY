import { chromium, devices } from "playwright";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Pixel 7"],
  userAgent:
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Instagram 312.0",
});
const page = await context.newPage();
await page.goto(
  "http://localhost:3000/shop/shivan-silicon-mould-making-master-mould-with-wall-set",
  { waitUntil: "domcontentloaded", timeout: 90000 },
);
await page.waitForTimeout(3000);
console.log(
  await page.evaluate(() => {
    const ua = navigator.userAgent;
    return {
      ua,
      hasIg: /instagram/i.test(ua),
      island: document.querySelector("[data-thry-sticky-island]")?.outerHTML,
    };
  }),
);
await browser.close();
