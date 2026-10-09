import { chromium, devices } from "playwright";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Pixel 7"],
  userAgent:
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 312.0.0.0.0",
});
const page = await context.newPage();
await page.goto(
  "http://localhost:3000/shop/shivan-silicon-mould-making-master-mould-with-wall-set",
  { waitUntil: "domcontentloaded", timeout: 120000 },
);
await page.waitForTimeout(4000);
console.log(
  await page.evaluate(() => ({
    nav: document.documentElement.dataset.thryNavHydrated,
    sticky: !!document.querySelector('[aria-label="Buy product"]'),
    iab: document.querySelector("[data-thry-iab]")?.getAttribute("data-thry-iab"),
    browseText: document
      .querySelector('[data-thry-iab="browse"]')
      ?.textContent?.slice(0, 80),
  })),
);
await browser.close();
