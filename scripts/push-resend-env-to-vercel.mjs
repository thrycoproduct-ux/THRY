/**
 * Push RESEND_* env vars to Vercel production.
 * Usage: VERCEL_TOKEN=... node scripts/push-resend-env-to-vercel.mjs
 */
import fs from "node:fs";
import path from "node:path";

const identity = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "project.identity.json"), "utf8"),
);
const TEAM_ID = identity.vercel?.teamId;
const PROJECT_ID = identity.vercel?.projectId;
if (!TEAM_ID || !PROJECT_ID) {
  console.error("Missing vercel.teamId / vercel.projectId in project.identity.json");
  process.exit(1);
}
const token = process.env.VERCEL_TOKEN?.trim();
if (!token) {
  console.error("Set VERCEL_TOKEN first (Vercel → Settings → Tokens)");
  process.exit(1);
}

const envPath = path.join(process.cwd(), ".env.local");
const raw = fs.readFileSync(envPath, "utf8");
const map = new Map();
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 1) continue;
  map.set(line.slice(0, i), line.slice(i + 1));
}

const KEYS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL"];

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
        type: "encrypted",
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
  if (!value) {
    console.error("missing", key, "in .env.local");
    process.exit(1);
  }
  await upsert(key, value);
}

console.log("done — redeploy production on Vercel for env to take effect");
