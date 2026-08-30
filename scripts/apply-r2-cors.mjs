/**
 * Apply production R2 CORS for browser digital Zip PUTs (admin on thryco.com).
 *
 * Usage (Cloudflare MCP / API token with R2 edit):
 *   CLOUDFLARE_API_TOKEN=... node scripts/apply-r2-cors.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvLocal() {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function readWranglerOAuth() {
  try {
    const oauthPath = join(homedir(), ".wrangler", "config", "default.toml");
    if (!existsSync(oauthPath)) return "";
    const text = readFileSync(oauthPath, "utf8");
    const m = text.match(/oauth_token\s*=\s*"([^"]+)"/);
    return m?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

/** Convert S3-style CORS JSON to Cloudflare R2 Management API `rules` body. */
function toApiRules(corsJson) {
  const entries = Array.isArray(corsJson) ? corsJson : corsJson.rules || [];
  return {
    rules: entries.map((rule, index) => ({
      id: rule.id || `thry-cors-${index + 1}`,
      allowed: {
        origins: rule.AllowedOrigins || rule.allowed?.origins || [],
        methods: rule.AllowedMethods || rule.allowed?.methods || [
          "GET",
          "PUT",
          "HEAD",
        ],
        headers: rule.AllowedHeaders ||
          rule.allowed?.headers || ["Content-Type", "Content-Length"],
      },
      exposeHeaders: rule.ExposeHeaders || rule.exposeHeaders || ["ETag"],
      maxAgeSeconds: rule.MaxAgeSeconds || rule.maxAgeSeconds || 86400,
    })),
  };
}

loadEnvLocal();

const identity = JSON.parse(
  readFileSync(join(root, "project.identity.json"), "utf8"),
);
const accountId = identity.cloudflare.accountId;
const bucket = identity.cloudflare.r2.mediaBucket;
const corsJson = JSON.parse(
  readFileSync(join(root, "scripts", "r2-cors.new-account.json"), "utf8"),
);
const body = toApiRules(corsJson);

const token =
  process.env.CLOUDFLARE_API_TOKEN?.trim() || readWranglerOAuth();
if (!token) {
  console.error(
    "Missing CLOUDFLARE_API_TOKEN (or wrangler login oauth_token).",
  );
  process.exit(1);
}

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/cors`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  },
);
const json = await res.json().catch(() => ({}));
console.log("status", res.status);
console.log("success", json.success);
if (json.errors?.length) console.log("errors", JSON.stringify(json.errors));
if (!res.ok || !json.success) process.exit(1);

const getRes = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/cors`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const getJson = await getRes.json().catch(() => ({}));
console.log(
  "cors rules",
  JSON.stringify(getJson.result ?? getJson, null, 2).slice(0, 4000),
);
console.log(`Applied CORS on ${bucket} (${accountId})`);
