import { chromium, devices } from "playwright";

const IG =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 312.0.0.0.0";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Pixel 7"],
  userAgent: IG,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
await page.goto(
  "http://localhost:3000/shop/shivan-silicon-mould-making-master-mould-with-wall-set",
  { waitUntil: "domcontentloaded", timeout: 120000 },
);
await page.waitForTimeout(6000);
console.log(JSON.stringify({ errors, count: errors.length }, null, 2));
await browser.close();
