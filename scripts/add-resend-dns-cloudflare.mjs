/**
 * Add Resend DNS records to thryco.com via Cloudflare OAuth (wrangler login).
 * Requires zone:edit on the token — re-run `npx wrangler login` with DNS scope if this fails.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const wranglerConfig = path.join(
  os.homedir(),
  "AppData/Roaming/xdg.config/.wrangler/config/default.toml",
);
const cfg = fs.readFileSync(wranglerConfig, "utf8");
const token = cfg.match(/oauth_token = "([^"]+)"/)?.[1];
if (!token) {
  console.error("Wrangler OAuth token not found. Run: npx wrangler login");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const zoneRes = await fetch(
  "https://api.cloudflare.com/client/v4/zones?name=thryco.com",
  { headers },
);
const zoneJson = await zoneRes.json();
const zoneId = zoneJson.result?.[0]?.id;
if (!zoneId) {
  console.error("Zone lookup failed:", zoneJson.errors ?? zoneJson);
  process.exit(1);
}
console.log("zoneId", zoneId);

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
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=${rec.type}&name=${encodeURIComponent(rec.name)}`,
    { headers },
  );
  const listJson = await listRes.json();
  if (listJson.result?.length) {
    console.log("exists", rec.type, rec.name);
    continue;
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
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
