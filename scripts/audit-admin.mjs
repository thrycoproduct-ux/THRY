import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

config({ path: ".env.local" });

const base = "http://localhost:3000";
const paths = [
  "/admin/dashboard",
  "/admin/products",
  "/admin/products/new",
  "/admin/collections",
  "/admin/collections/new",
  "/admin/testimonials",
  "/admin/medias",
  "/admin/medias/new",
  "/admin/users",
  "/admin/orders",
  "/admin/settings",
  "/admin/settings/apis",
  "/admin/settings/social",
  "/admin/settings/announcement-bar",
  "/admin/settings/home-banner",
  "/admin/settings/velo",
  "/admin/settings/courier",
  "/admin/settings/offer-codes",
  "/admin/settings/shop-contact",
  "/admin/settings/stock-control",
  "/admin/settings/bulk-order",
];

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const { data, error } = await sb.auth.signInWithPassword({
  email: "sanjay.cyber.audit@gmail.com",
  password: "HocAdmin_3b0a578b!2026",
});
if (error) throw error;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies([
  {
    name: `sb-${process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF}-auth-token`,
    value: encodeURIComponent(JSON.stringify(data.session)),
    domain: "localhost:3000",
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  },
]);

const results = [];
for (const path of paths) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message.split("\n")[0]));
  let status = null;
  try {
    const res = await page.goto(`${base}${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    status = res?.status() ?? null;
    await page.waitForTimeout(4500);
  } catch (e) {
    results.push({
      path,
      ok: false,
      status,
      reason: `nav: ${e.message.split("\n")[0]}`,
      pageErrors,
    });
    await page.close();
    continue;
  }

  const body = await page.locator("body").innerText().catch(() => "");
  const title = await page.title().catch(() => "");
  const errorUi =
    body.includes("Admin could not load") ||
    body.includes("Something went wrong loading the admin panel") ||
    body.includes("Application error");
  const failedLoad =
    /Failed to load|Could not load|timed out|notFound|404/i.test(body) &&
    !body.includes("No paid orders");
  const ok = !errorUi && pageErrors.length === 0 && (status === 200 || status === 304);
  results.push({
    path,
    ok,
    status,
    errorUi,
    failedLoad,
    pageErrors: pageErrors.slice(0, 2),
    snip: body.replace(/\s+/g, " ").slice(0, 160),
    title,
  });
  await page.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.ok || r.errorUi || r.failedLoad);
console.log("\nSUMMARY bad=", bad.length, "/", results.length);
for (const r of bad) {
  console.log(
    "-",
    r.path,
    "status=",
    r.status,
    "errorUi=",
    r.errorUi,
    "failedLoad=",
    r.failedLoad,
    "errs=",
    r.pageErrors.join(" | "),
  );
}
