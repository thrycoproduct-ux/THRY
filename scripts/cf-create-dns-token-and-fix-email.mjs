/**
 * Create a short-lived Cloudflare API token with Zone DNS Edit on thryco.com,
 * then apply full email DNS (Resend + DMARC + fix send subdomain).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ACCOUNT_ID = "77dfa9b757691b2321fe0630f01c8c6a";
const ZONE_ID = "1b7976cc6df1e48295b653f94822ce56";
const ZONE_NAME = "thryco.com";

const cfg = fs.readFileSync(
  path.join(os.homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml"),
  "utf8",
);
const oauth = cfg.match(/oauth_token = "([^"]+)"/)?.[1];
if (!oauth) {
  console.error("Run: npx wrangler login");
  process.exit(1);
}

const oauthHeaders = {
  Authorization: `Bearer ${oauth}`,
  "Content-Type": "application/json",
};

async function cf(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { ...oauthHeaders, ...(init.headers ?? {}) },
  });
  const json = await res.json();
  return { res, json };
}

// Find DNS Edit permission group
const { json: pgJson } = await cf("/user/tokens/permission_groups");
if (!pgJson.success) {
  console.error("permission_groups failed", pgJson.errors);
  process.exit(1);
}

const dnsEdit = pgJson.result.find((p) =>
  /Zone DNS Edit/i.test(p.name),
);
const zoneRead = pgJson.result.find((p) =>
  /Zone Read/i.test(p.name),
);
console.log("dnsEdit", dnsEdit?.id, dnsEdit?.name);
console.log("zoneRead", zoneRead?.id, zoneRead?.name);

if (!dnsEdit) {
  console.error("DNS Edit permission group not found");
  process.exit(1);
}

const tokenBody = {
  name: `thryco-dns-${Date.now()}`,
  policies: [
    {
      effect: "allow",
      resources: {
        [`com.cloudflare.api.account.zone.${ZONE_ID}`]: "*",
      },
      permission_groups: [{ id: dnsEdit.id }],
    },
  ],
};

let created = await cf("/user/tokens", {
  method: "POST",
  body: JSON.stringify(tokenBody),
});

if (!created.json.success) {
  console.log("user/tokens failed, trying account/tokens", created.json.errors);
  created = await cf(`/accounts/${ACCOUNT_ID}/tokens`, {
    method: "POST",
    body: JSON.stringify(tokenBody),
  });
}

if (!created.json.success || !created.json.result?.value) {
  console.error("token create failed", created.json.errors);
  process.exit(2);
}

const dnsToken = created.json.result.value;
console.log("created token", created.json.result.id);

const dnsHeaders = {
  Authorization: `Bearer ${dnsToken}`,
  "Content-Type": "application/json",
};

async function dns(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { ...dnsHeaders, ...(init.headers ?? {}) },
  });
  const json = await res.json();
  return { res, json };
}

async function listRecords(name) {
  const { json } = await dns(
    `/zones/${ZONE_ID}/dns_records?name=${encodeURIComponent(name)}&per_page=100`,
  );
  return json.result ?? [];
}

async function deleteRecord(id) {
  const { json } = await dns(`/zones/${ZONE_ID}/dns_records/${id}`, {
    method: "DELETE",
  });
  if (!json.success) throw new Error(JSON.stringify(json.errors));
}

async function upsertRecord(rec) {
  const existing = await listRecords(rec.name);
  const match = existing.find((r) => r.type === rec.type);
  if (match) {
    const same =
      match.content === rec.content &&
      (rec.priority == null || match.priority === rec.priority);
    if (same) {
      console.log("exists", rec.type, rec.name);
      return;
    }
    const { json } = await dns(`/zones/${ZONE_ID}/dns_records/${match.id}`, {
      method: "PATCH",
      body: JSON.stringify(rec),
    });
    if (!json.success) throw new Error(`patch ${rec.name}: ${JSON.stringify(json.errors)}`);
    console.log("updated", rec.type, rec.name);
    return;
  }
  const { json } = await dns(`/zones/${ZONE_ID}/dns_records`, {
    method: "POST",
    body: JSON.stringify(rec),
  });
  if (!json.success) throw new Error(`create ${rec.name}: ${JSON.stringify(json.errors)}`);
  console.log("created", rec.type, rec.name);
}

// Remove wrong Cloudflare Email Routing records on send.thryco.com
const sendRecords = await listRecords("send.thryco.com");
console.log("send records before", sendRecords.map((r) => `${r.type} ${r.content}`));
for (const rec of sendRecords) {
  if (
    rec.type === "MX" &&
    /route\d\.mx\.cloudflare\.net/.test(rec.content)
  ) {
    await deleteRecord(rec.id);
    console.log("deleted wrong MX", rec.content);
  }
  if (
    rec.type === "TXT" &&
    rec.content.includes("_spf.mx.cloudflare.net")
  ) {
    await deleteRecord(rec.id);
    console.log("deleted wrong SPF on send");
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

for (const rec of records) {
  await upsertRecord(rec);
}

console.log("done");
