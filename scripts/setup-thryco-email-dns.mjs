/**
 * Add Resend + DMARC DNS via Cloudflare API (Wrangler OAuth or CLOUDFLARE_API_TOKEN).
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
  console.error("Missing CLOUDFLARE_API_TOKEN or wrangler login");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function cf(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const json = await res.json();
  return { res, json };
}

async function upsertRecord(rec) {
  const q = new URLSearchParams({ type: rec.type, name: rec.name });
  const { json: list } = await cf(
    `/zones/${ZONE_ID}/dns_records?${q.toString()}`,
  );
  const existing = list.result?.[0];
  if (existing) {
    const same =
      existing.content === rec.content &&
      (rec.priority == null || existing.priority === rec.priority);
    if (same) {
      console.log("exists", rec.type, rec.name);
      return;
    }
    const { json } = await cf(`/zones/${ZONE_ID}/dns_records/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify(rec),
    });
    if (!json.success) {
      console.error("patch failed", rec.name, json.errors);
      process.exit(1);
    }
    console.log("updated", rec.type, rec.name);
    return;
  }

  const { json } = await cf(`/zones/${ZONE_ID}/dns_records`, {
    method: "POST",
    body: JSON.stringify(rec),
  });
  if (!json.success) {
    console.error("create failed", rec.type, rec.name, json.errors);
    process.exit(1);
  }
  console.log("created", rec.type, rec.name);
}

// Merge Resend into apex SPF (keep Cloudflare Email Routing)
const apexSpf =
  "v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all";

const records = [
  {
    type: "TXT",
    name: "thryco.com",
    content: apexSpf,
    ttl: 1,
  },
  {
    type: "TXT",
    name: "_dmarc.thryco.com",
    content: "v=DMARC1; p=none; rua=mailto:thrycoproduct@gmail.com",
    ttl: 1,
  },
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
  await upsertRecord(rec);
}

console.log("done");
