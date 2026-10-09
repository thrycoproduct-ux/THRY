import { chromium, devices } from "playwright";

const IG =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 312.0.0.0.0";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Pixel 7"],
  userAgent: IG,
});
const page = await context.newPage();
await page.goto(
  "http://localhost:3000/shop/shivan-silicon-mould-making-master-mould-with-wall-set",
  { waitUntil: "domcontentloaded", timeout: 120000 },
);
await page.waitForTimeout(3000);
console.log(
  await page.evaluate(() => {
    const browse = document.querySelector('[data-thry-iab="browse"]');
    const sticky = document.querySelector('[aria-label="Buy product"]');
    const r = browse?.getBoundingClientRect();
    return {
      browse: !!browse,
      browseText: browse?.textContent?.slice(0, 100) ?? null,
      browseTop: r ? Math.round(r.top) : null,
      browseHeight: r ? Math.round(r.height) : null,
      sticky: !!sticky,
      nearBottom: r ? r.bottom > window.innerHeight - 120 : false,
    };
  }),
);
await browser.close();
