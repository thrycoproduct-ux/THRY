/**
 * Upsert CATALOG_* env on Vercel (production + preview + development).
 * Usage: VERCEL_TOKEN=... node scripts/push-catalog-env-to-vercel.mjs
 * Reads CATALOG_WORKER_URL / CATALOG_SYNC_SECRET from .env.local
 * Keeps CATALOG_READ=supabase until you intentionally flip it.
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

function parseEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  const map = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    map[line.slice(0, i)] = line.slice(i + 1);
  }
  return map;
}

const local = parseEnvLocal();
const workerUrl =
  local.CATALOG_WORKER_URL ||
  "https://thry-catalog.thrycoproduct.workers.dev";
const syncSecret = local.CATALOG_SYNC_SECRET;
if (!syncSecret) {
  console.error("CATALOG_SYNC_SECRET missing in .env.local");
  process.exit(1);
}

const vars = [
  {
    key: "CATALOG_READ",
    value: "supabase",
    type: "plain",
    target: ["production", "preview", "development"],
  },
  {
    key: "CATALOG_WORKER_URL",
    value: workerUrl,
    type: "plain",
    target: ["production", "preview", "development"],
  },
  {
    key: "CATALOG_SYNC_SECRET",
    value: syncSecret,
    type: "sensitive",
    target: ["production", "preview", "development"],
  },
];

async function upsert(entry) {
  const url = new URL(
    `https://api.vercel.com/v10/projects/${PROJECT_ID}/env`,
  );
  url.searchParams.set("teamId", TEAM_ID);
  url.searchParams.set("upsert", "true");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entry),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${entry.key}: ${res.status} ${JSON.stringify(body)}`);
  }
  console.log("ok", entry.key);
}

for (const entry of vars) {
  await upsert(entry);
}
console.log("Done. Redeploy production to pick up env. Keep CATALOG_READ=supabase until Preview d1 check.");
