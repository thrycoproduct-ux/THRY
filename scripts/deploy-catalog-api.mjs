/**
 * Deploy thry-catalog via Cloudflare API using token from env or wrangler config.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const accountId = "77dfa9b757691b2321fe0630f01c8c6a";
const scriptName = "thry-catalog";
const dbId = "85283c0d-4c77-4187-8d68-ff166a1a6d50";

function findToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN.trim();
  const candidates = [
    join(process.env.APPDATA || "", "xdg.config/.wrangler/config/default.toml"),
    join(process.env.HOME || "", ".wrangler/config/default.toml"),
    join(process.env.USERPROFILE || "", ".wrangler/config/default.toml"),
    join(process.env.LOCALAPPDATA || "", "xdg.config/.wrangler/config/default.toml"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const toml = readFileSync(p, "utf8");
    const m = toml.match(/oauth_token\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  // Cursor may store elsewhere
  const cursorCandidates = [
    join(process.env.USERPROFILE || "", ".config/.wrangler/config/default.toml"),
    "C:/Users/sanjay_arun2/AppData/Roaming/xdg.config/.wrangler/config/default.toml",
  ];
  for (const p of cursorCandidates) {
    if (!existsSync(p)) continue;
    const toml = readFileSync(p, "utf8");
    const m = toml.match(/oauth_token\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  return null;
}

const token = findToken();
if (!token) {
  console.error("NO_TOKEN");
  process.exit(2);
}

const workerCode = readFileSync("workers/thry-catalog/dist-worker.js", "utf8");
const secrets = JSON.parse(
  readFileSync("workers/thry-catalog/.secrets.local.json", "utf8"),
);

const metadata = {
  main_module: "worker.js",
  compatibility_date: "2026-08-14",
  bindings: [
    { type: "d1", name: "DB", id: dbId },
    {
      type: "secret_text",
      name: "CATALOG_SYNC_SECRET",
      text: secrets.CATALOG_SYNC_SECRET,
    },
    { type: "secret_text", name: "SUPABASE_URL", text: secrets.SUPABASE_URL },
    {
      type: "secret_text",
      name: "SUPABASE_ANON_KEY",
      text: secrets.SUPABASE_ANON_KEY,
    },
  ],
};

const b = "----B" + Date.now();
const body = [
  "--" + b,
  'Content-Disposition: form-data; name="metadata"',
  "Content-Type: application/json",
  "",
  JSON.stringify(metadata),
  "--" + b,
  'Content-Disposition: form-data; name="worker.js"; filename="worker.js"',
  "Content-Type: application/javascript+module",
  "",
  workerCode,
  "--" + b + "--",
].join("\r\n");

const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}?include_subdomain_availability=true`;
const res = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": `multipart/form-data; boundary=${b}`,
  },
  body,
});
const json = await res.json();
writeFileSync(
  "workers/thry-catalog/_last-deploy-result.json",
  JSON.stringify({ status: res.status, json }, null, 2),
);
console.log(
  JSON.stringify({
    status: res.status,
    success: json.success,
    errors: json.errors,
    id: json.result?.id,
  }),
);

if (json.success) {
  const sub = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled: true }),
    },
  );
  const subJson = await sub.json();
  console.log("subdomain", sub.status, subJson.success);
}
