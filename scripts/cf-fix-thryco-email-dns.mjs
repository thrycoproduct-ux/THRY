/**
 * Fix thryco.com email DNS: Resend outbound + DMARC + merged apex SPF.
 *
 * Auth (first match):
 *   1. .cloudflare-dns.token (gitignored — create at dash.cloudflare.com/profile/api-tokens → Edit zone DNS → thryco.com)
 *   2. CLOUDFLARE_API_TOKEN env or .env.local
 *   3. Wrangler OAuth (routing only; DNS writes will 403)
 *
 * Usage: npm run email:dns:fix
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ZONE_ID = "1b7976cc6df1e48295b653f94822ce56";
const ZONE_NAME = "thryco.com";

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

function readWranglerOAuth() {
  const wranglerConfig = path.join(
    os.homedir(),
    "AppData/Roaming/xdg.config/.wrangler/config/default.toml",
  );
  if (!fs.existsSync(wranglerConfig)) return null;
  const cfg = fs.readFileSync(wranglerConfig, "utf8");
  return cfg.match(/oauth_token = "([^"]+)"/)?.[1] ?? null;
}

loadEnvLocal();

function readToken() {
  const tokenPath = path.join(process.cwd(), ".cloudflare-dns.token");
  if (fs.existsSync(tokenPath)) {
    const fromFile = fs.readFileSync(tokenPath, "utf8").trim();
    if (fromFile) return fromFile;
  }
  return process.env.CLOUDFLARE_API_TOKEN?.trim() || readWranglerOAuth();
}

const token = readToken();
if (!token) {
  console.error("No auth token");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function cf(pathSuffix, init = {}) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}${pathSuffix}`,
    { ...init, headers: { ...headers, ...(init.headers ?? {}) } },
  );
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { res, json };
}

function log(label, { res, json }) {
  console.log(
    label,
    res.status,
    json.success,
    json.errors?.[0]?.message ?? json.result?.status ?? "ok",
  );
}

// Ensure apex Email Routing stays enabled (inbound @thryco.com)
log(
  "POST routing/enable",
  await cf("/email/routing/enable", { method: "POST" }),
);
async function listRecords(name) {
  const { json } = await cf(
    `/dns_records?name=${encodeURIComponent(name)}&per_page=100`,
  );
  return json.result ?? [];
}

async function upsertRecord(rec) {
  const existing = (await listRecords(rec.name)).find((r) => r.type === rec.type);
  if (existing) {
    const same =
      existing.content.replace(/^"|"$/g, "") === rec.content &&
      (rec.priority == null || existing.priority === rec.priority);
    if (same) {
      console.log("exists", rec.type, rec.name);
      return true;
    }
    const { json } = await cf(`/dns_records/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify(rec),
    });
    if (!json.success) {
      console.error("patch failed", rec.name, json.errors);
      return false;
    }
    console.log("updated", rec.type, rec.name);
    return true;
  }
  const { json } = await cf("/dns_records", {
    method: "POST",
    body: JSON.stringify(rec),
  });
  if (!json.success) {
    console.error("create failed", rec.name, json.errors);
    return false;
  }
  console.log("created", rec.type, rec.name);
  return true;
}

// Remove wrong send.thryco.com routing records if unlocked
const sendRecords = await listRecords("send.thryco.com");
console.log(
  "send records",
  sendRecords.length,
  sendRecords.map((r) => `${r.type}:${r.content.slice(0, 40)}`),
);
for (const rec of sendRecords) {
  if (
    (rec.type === "MX" && /route\d\.mx\.cloudflare\.net/.test(rec.content)) ||
    (rec.type === "TXT" && rec.content.includes("_spf.mx.cloudflare.net"))
  ) {
    const { json } = await cf(`/dns_records/${rec.id}`, { method: "DELETE" });
    console.log("delete", rec.type, json.success, json.errors?.[0]?.message);
  }
}

const apexSpf =
  "v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all";

const records = [
  {
    type: "TXT",
    name: ZONE_NAME,
    content: apexSpf,
    ttl: 1,
  },
  {
    type: "TXT",
    name: `_dmarc.${ZONE_NAME}`,
    content: "v=DMARC1; p=none; rua=mailto:thrycoproduct@gmail.com",
    ttl: 1,
  },
  {
    type: "TXT",
    name: `resend._domainkey.${ZONE_NAME}`,
    content:
      "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEQM4u2MhnMeddV0D39cLXW0r3kl6u8AJiTAGeYJyEZU5MXCK2+VUsR5nydh2FIpmeMmrOnCyGMO2DHxMGDZULUVjtQbbRqqhg29yC/AO/QaBfva2Upfd1NrNxEIh2hjchWUNVd1DcNkPJttPUqwVgQ6srJ4F9PDW0IlUwiyS2xwIDAQAB",
    ttl: 1,
  },
  {
    type: "MX",
    name: `send.${ZONE_NAME}`,
    content: "feedback-smtp.us-east-1.amazonses.com",
    priority: 10,
    ttl: 1,
  },
  {
    type: "TXT",
    name: `send.${ZONE_NAME}`,
    content: "v=spf1 include:amazonses.com ~all",
    ttl: 1,
  },
];

let dnsOk = true;
for (const rec of records) {
  const ok = await upsertRecord(rec);
  dnsOk = dnsOk && ok;
}

const routing = await cf("/email/routing");
console.log(
  "final routing",
  JSON.stringify({
    enabled: routing.json.result?.enabled,
    status: routing.json.result?.status,
    subdomains: routing.json.result?.subdomains?.map((s) => s.name),
  }),
);

if (!dnsOk) {
  console.log(
    "\nDNS writes need a Cloudflare API token with Zone DNS Edit on thryco.com.",
  );
  console.log(
    "Create one: https://dash.cloudflare.com/profile/api-tokens → Edit zone DNS → zone: thryco.com",
  );
  console.log(
    "Save the token (one line) to: .cloudflare-dns.token  then re-run: npm run email:dns:fix",
  );
  process.exit(2);
}

console.log("done");
