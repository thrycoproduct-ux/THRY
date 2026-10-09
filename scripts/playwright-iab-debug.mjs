import { chromium, devices } from "playwright";

const IG =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 312.0.0.0.0";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Pixel 7"],
  userAgent: IG,
});
const page = await context.newPage();
const res = await page.goto(
  "http://localhost:3000/shop/shivan-silicon-mould-making-master-mould-with-wall-set",
  { waitUntil: "domcontentloaded", timeout: 120000 },
);
await page.waitForTimeout(8000);
console.log({
  status: res?.status(),
  title: await page.title(),
  url: page.url(),
  bodyStart: (await page.locator("body").innerText()).slice(0, 300),
});
console.log(
  await page.evaluate(() => ({
    detect: document.documentElement.dataset.thryIabDetect,
    iab: document.querySelector("[data-thry-iab]")?.getAttribute("data-thry-iab"),
    sticky: !!document.querySelector('[aria-label="Buy product"]'),
    mailBtn: !!document.querySelector('[aria-label="Quick actions"]'),
  })),
);
await browser.close();
