/**
 * Add Resend DNS records to thryco.com.
 *
 * Auth (first match wins):
 *   1. CLOUDFLARE_API_TOKEN env or .env.local (Zone DNS Edit on thryco.com)
 *   2. Wrangler OAuth — read-only for DNS; will fail on create
 *
 * Usage:
 *   node scripts/add-resend-dns-cloudflare.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ZONE_ID = "1b7976cc6df1e48295b653f94822ce56";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i);
    if (process.env[key] == null) process.env[key] = line.slice(i + 1);
  }
}

loadEnvLocal();

function readWranglerOAuth() {
  const wranglerConfig = path.join(
    os.homedir(),
    "AppData/Roaming/xdg.config/.wrangler/config/default.toml",
  );
  if (!fs.existsSync(wranglerConfig)) return null;
  const cfg = fs.readFileSync(wranglerConfig, "utf8");
  return cfg.match(/oauth_token = "([^"]+)"/)?.[1] ?? null;
}

const token = process.env.CLOUDFLARE_API_TOKEN?.trim() || readWranglerOAuth();
if (!token) {
  console.error("Set CLOUDFLARE_API_TOKEN in .env.local (Zone DNS Edit) or run: npx wrangler login");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const records = [
  {
    type: "TXT",
    name: "resend._domainkey.thryco.com",
    content:
      "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEQM4u2MhnMeddV0D39cLXW0r3kl6u8AJiTAGeYJyEZU5MXCK2+VUsR5nydh2FIpmeMmrOnCyGMO2DHxMGDZULUVjtQbbRqqhg29yC/AO/QaBfva2Upfd1NrNxEIh2hjchWUNVd1DcNkPJttPUqwVgQ6srJ4F9PDW0IlUwiyS2xwIDAQAB",
    ttl: 1,
  },
  {
    type: "MX",
    name: "send.thryco.com",
    content: "feedback-smtp.us-east-1.amazonses.com",
    priority: 10,
    ttl: 1,
  },
  {
    type: "TXT",
    name: "send.thryco.com",
    content: "v=spf1 include:amazonses.com ~all",
    ttl: 1,
  },
];

for (const rec of records) {
  const listRes = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?type=${rec.type}&name=${encodeURIComponent(rec.name)}`,
    { headers },
  );
  const listJson = await listRes.json();
  if (listJson.result?.length) {
    console.log("exists", rec.type, rec.name);
    continue;
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records`,
    { method: "POST", headers, body: JSON.stringify(rec) },
  );
  const json = await res.json();
  if (!json.success) {
    console.error("failed", rec.type, rec.name, json.errors);
    process.exit(1);
  }
  console.log("created", rec.type, rec.name);
}

console.log("done");
