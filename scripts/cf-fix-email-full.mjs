/**
 * Full email DNS fix using Wrangler OAuth + optional DNS token.
 * Removes send.thryco.com from Email Routing, restores Resend records.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ZONE_ID = "1b7976cc6df1e48295b653f94822ce56";
const ZONE_NAME = "thryco.com";
const SEND_SUBDOMAIN_ID = "145e14e2ebde4889833771c92b28516d";

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
  const cfg = fs.readFileSync(
    path.join(os.homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml"),
    "utf8",
  );
  return cfg.match(/oauth_token = "([^"]+)"/)?.[1] ?? null;
}

loadEnvLocal();

const oauth = readWranglerOAuth();
const dnsToken =
  (fs.existsSync(path.join(process.cwd(), ".cloudflare-dns.token"))
    ? fs.readFileSync(path.join(process.cwd(), ".cloudflare-dns.token"), "utf8").trim()
    : "") ||
  process.env.CLOUDFLARE_API_TOKEN?.trim() ||
  "";

async function api(token, pathSuffix, init = {}) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}${pathSuffix}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    },
  );
  const json = await res.json();
  return { status: res.status, json };
}

function log(step, { status, json }) {
  console.log(
    step,
    status,
    json.success,
    json.errors?.[0]?.message ?? json.result?.status ?? "",
  );
}

// Step 1: Remove send subdomain from Email Routing (needs API token for DELETE)
if (dnsToken) {
  log(
    "DELETE send subdomain",
    await api(dnsToken, `/email/routing/subdomains/${SEND_SUBDOMAIN_ID}`, {
      method: "DELETE",
    }),
  );
} else if (oauth) {
  log(
    "DELETE send subdomain (oauth)",
    await api(oauth, `/email/routing/subdomains/${SEND_SUBDOMAIN_ID}`, {
      method: "DELETE",
    }),
  );
}

// Step 2: Ensure apex routing enabled
if (oauth) {
  log("enable routing", await api(oauth, "/email/routing/enable", { method: "POST" }));
}

const tokenForDns = dnsToken || oauth;
if (!tokenForDns) {
  console.error("No token");
  process.exit(1);
}

async function list(name) {
  const { json } = await api(tokenForDns, `/dns_records?name=${encodeURIComponent(name)}&per_page=100`);
  return json.result ?? [];
}

async function upsert(rec) {
  const existing = (await list(rec.name)).find((r) => r.type === rec.type);
  if (existing) {
    const content = existing.content.replace(/^"|"$/g, "");
    if (content === rec.content && (rec.priority == null || existing.priority === rec.priority)) {
      console.log("exists", rec.type, rec.name);
      return true;
    }
    const r = await api(tokenForDns, `/dns_records/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify(rec),
    });
    if (!r.json.success) {
      console.error("patch", rec.name, r.json.errors);
      return false;
    }
    console.log("updated", rec.type, rec.name);
    return true;
  }
  const r = await api(tokenForDns, "/dns_records", {
    method: "POST",
    body: JSON.stringify(rec),
  });
  if (!r.json.success) {
    console.error("create", rec.name, r.json.errors);
    return false;
  }
  console.log("created", rec.type, rec.name);
  return true;
}

// Remove wrong send records
for (const rec of await list("send.thryco.com")) {
  if (
    (rec.type === "MX" && /route\d\.mx\.cloudflare\.net/.test(rec.content)) ||
    (rec.type === "TXT" && rec.content.includes("_spf.mx.cloudflare.net"))
  ) {
    const r = await api(tokenForDns, `/dns_records/${rec.id}`, { method: "DELETE" });
    console.log("deleted", rec.type, r.json.success, r.json.errors?.[0]?.message);
  }
}

const records = [
  {
    type: "TXT",
    name: ZONE_NAME,
    content: "v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all",
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

let ok = true;
for (const rec of records) ok = (await upsert(rec)) && ok;

console.log(ok ? "DNS_OK" : "DNS_PARTIAL");
