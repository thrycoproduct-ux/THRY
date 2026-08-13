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
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies([
  {
    name: storageKey,
    value: encodeURIComponent(JSON.stringify(data.session)),
    domain: "localhost:3000",
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  },
]);

const paths = [
  "/admin/dashboard",
  "/admin/products",
  "/admin/collections",
  "/admin/orders",
  "/admin/settings",
];

for (const path of paths) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(`${base}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(4000);
  const body = await page.locator("body").innerText();
  const failed = body.includes("Admin could not load") || errors.length > 0;
  console.log(
    `${failed ? "FAIL" : "OK  "} ${path} errors=${errors.length} ${errors[0] || ""}`,
  );
  await page.close();
}

await browser.close();
