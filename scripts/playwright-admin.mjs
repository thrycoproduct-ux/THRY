import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

config({ path: ".env.local" });

const base = "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const projectRef = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF;

const sb = createClient(url, anon);
const { data, error } = await sb.auth.signInWithPassword({
  email: "sanjay.cyber.audit@gmail.com",
  password: "HocAdmin_3b0a578b!2026",
});
if (error) throw error;

const storageKey = `sb-${projectRef}-auth-token`;
const sessionJson = JSON.stringify(data.session);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies([
  {
    name: storageKey,
    value: encodeURIComponent(sessionJson),
    domain: "localhost:3000",
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  },
]);

const page = await context.newPage();
const logs = [];
page.on("console", (msg) => {
  logs.push(`[${msg.type()}] ${msg.text()}`);
});
page.on("pageerror", (err) => {
  logs.push(`[pageerror] ${err.message}\n${err.stack || ""}`);
});

await page.goto(`${base}/admin/dashboard`, {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(8000);

const title = await page.title();
const bodyText = await page.locator("body").innerText();
console.log("TITLE:", title);
console.log("HAS_ERROR_UI:", bodyText.includes("Admin could not load"));
console.log("BODY_SNIP:", bodyText.slice(0, 500).replace(/\s+/g, " "));
console.log("---LOGS---");
for (const line of logs) console.log(line);

await browser.close();
