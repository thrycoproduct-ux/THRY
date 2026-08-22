/**
 * Push selected .env.local keys to Vercel project "thry" (Thryco team).
 * Usage: VERCEL_TOKEN=... node scripts/push-env-to-vercel.mjs
 */
import fs from "node:fs";
import path from "node:path";

const TEAM_ID = "team_DAup0iV9bvGvaL1mIGH9a7al";
const PROJECT_ID = "prj_48M3Nk6JuE9KInZf1t51ww1V6K78";
const token = process.env.VERCEL_TOKEN?.trim();
if (!token) {
  console.error("Set VERCEL_TOKEN first");
  process.exit(1);
}

const KEYS = [
  "SKIP_ENV_VALIDATION",
  "NEXT_PUBLIC_SUPABASE_PROJECT_REF",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "DATABASE_SERVICE_ROLE",
  "DATABASE_URL",
  "NEXT_PUBLIC_S3_BUCKET",
  "NEXT_PUBLIC_S3_REGION",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "NEXT_PUBLIC_CDN_URL",
  "NEXT_PUBLIC_SITE_URL",
  "ORDER_ACCESS_SECRET",
  "CRON_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECERT_KEY",
  "R2_MEDIA_PROXY_URL",
  "R2_MEDIA_PROXY_SECRET",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
];

const envPath = path.join(process.cwd(), ".env.local");
const raw = fs.readFileSync(envPath, "utf8");
const map = new Map();
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 1) continue;
  map.set(line.slice(0, i), line.slice(i + 1));
}

async function upsert(key, value) {
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}&upsert=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key,
        value,
        type: key.startsWith("NEXT_PUBLIC_") ? "plain" : "encrypted",
        target: ["production", "preview", "development"],
      }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`${key}: ${res.status} ${text}`);
  console.log("set", key);
}

for (const key of KEYS) {
  const value = map.get(key);
  if (value == null || value === "") {
    console.log("skip empty", key);
    continue;
  }
  await upsert(key, value);
}

console.log("done — trigger a redeploy in Vercel");
