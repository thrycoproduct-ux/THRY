import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

config({ path: ".env.local" });

const base = "http://localhost:3000";
const path = process.argv[2] || "/admin/products";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const projectRef = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF;

const sb = createClient(url, anon);
const { data, error } = await sb.auth.signInWithPassword({
  email: "sanjay.cyber.audit@gmail.com",
  password: "HocAdmin_3b0a578b!2026",
});
if (error) throw error;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies([
  {
    name: `sb-${projectRef}-auth-token`,
    value: encodeURIComponent(JSON.stringify(data.session)),
    domain: "localhost:3000",
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  },
]);

const page = await context.newPage();
page.on("pageerror", (err) => {
  console.log("PAGEERROR:", err.message);
  console.log(err.stack);
});
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("CONSOLE:", msg.text());
});

await page.goto(`${base}${path}`, {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(5000);
const body = await page.locator("body").innerText();
console.log("ERROR_UI:", body.includes("Admin could not load"));
console.log("SNIP:", body.slice(0, 400).replace(/\s+/g, " "));
await browser.close();
