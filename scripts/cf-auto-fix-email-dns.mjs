/**
 * Create zone-scoped DNS Edit token via Wrangler OAuth, apply email DNS, verify.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ZONE_ID = "1b7976cc6df1e48295b653f94822ce56";
const ZONE_NAME = "thryco.com";
const SEND_SUBDOMAIN_ID = "145e14e2ebde4889833771c92b28516d";
const DNS_EDIT_GROUP = "4755a9fef5f847eda8857ae835f1a7e0";
const EMAIL_ROUTING_GROUP = "02454a5468248720d7a2c1a475001e87";

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

async function cf(pathSuffix, init = {}, token = oauth) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${pathSuffix}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const json = await res.json();
  return { status: res.status, json };
}

function loadToken() {
  const p = path.join(process.cwd(), ".cloudflare-dns.token");
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
  return process.env.CLOUDFLARE_API_TOKEN?.trim() || "";
}

async function tokenWorks(token) {
  const { json } = await cf(`/zones/${ZONE_ID}/dns_records?per_page=1`, {}, token);
  return json.success === true;
}

let token = loadToken();
if (!(await tokenWorks(token))) {
  console.log("Creating scoped DNS token via Wrangler OAuth...");
  const body = {
    name: `thryco-email-dns-${Date.now()}`,
    policies: [
      {
        effect: "allow",
        resources: { [`com.cloudflare.api.account.zone.${ZONE_ID}`]: "*" },
        permission_groups: [{ id: DNS_EDIT_GROUP }, { id: EMAIL_ROUTING_GROUP }],
      },
    ],
  };
  let created = await cf("/user/tokens", { method: "POST", body: JSON.stringify(body) });
  if (!created.json.success) {
    created = await cf("/accounts/77dfa9b757691b2321fe0630f01c8c6a/tokens", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  if (!created.json.success || !created.json.result?.value) {
    console.error("token create failed", created.json.errors);
    process.exit(2);
  }
  token = created.json.result.value;
  fs.writeFileSync(path.join(process.cwd(), ".cloudflare-dns.token"), token, "utf8");
  console.log("created token", created.json.result.id);
}

if (!(await tokenWorks(token))) {
  console.error("Token cannot read thryco.com DNS. Recreate manually with Zone DNS Edit on thryco.com.");
  process.exit(3);
}

async function zoneApi(pathSuffix, init = {}) {
  return cf(`/zones/${ZONE_ID}${pathSuffix}`, init, token);
}

console.log("DELETE send subdomain", await zoneApi(`/email/routing/subdomains/${SEND_SUBDOMAIN_ID}`, { method: "DELETE" }).then(r => ({ status: r.status, ok: r.json.success, err: r.json.errors?.[0]?.message })));

async function list(name) {
  const { json } = await zoneApi(`/dns_records?name=${encodeURIComponent(name)}&per_page=100`);
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
    const { json } = await zoneApi(`/dns_records/${existing.id}`, { method: "PATCH", body: JSON.stringify(rec) });
    if (!json.success) { console.error("patch", rec.name, json.errors); return false; }
    console.log("updated", rec.type, rec.name);
    return true;
  }
  const { json } = await zoneApi("/dns_records", { method: "POST", body: JSON.stringify(rec) });
  if (!json.success) { console.error("create", rec.name, json.errors); return false; }
  console.log("created", rec.type, rec.name);
  return true;
}

for (const rec of await list("send.thryco.com")) {
  if (
    (rec.type === "MX" && /route\d\.mx\.cloudflare\.net/.test(rec.content)) ||
    (rec.type === "TXT" && rec.content.includes("_spf.mx.cloudflare.net"))
  ) {
    const { json } = await zoneApi(`/dns_records/${rec.id}`, { method: "DELETE" });
    console.log("deleted wrong send", rec.type, json.success, json.errors?.[0]?.message);
  }
}

const records = [
  { type: "TXT", name: ZONE_NAME, content: "v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all", ttl: 1 },
  { type: "TXT", name: `_dmarc.${ZONE_NAME}`, content: "v=DMARC1; p=none; rua=mailto:thrycoproduct@gmail.com", ttl: 1 },
  { type: "TXT", name: `resend._domainkey.${ZONE_NAME}`, content: "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEQM4u2MhnMeddV0D39cLXW0r3kl6u8AJiTAGeYJyEZU5MXCK2+VUsR5nydh2FIpmeMmrOnCyGMO2DHxMGDZULUVjtQbbRqqhg29yC/AO/QaBfva2Upfd1NrNxEIh2hjchWUNVd1DcNkPJttPUqwVgQ6srJ4F9PDW0IlUwiyS2xwIDAQAB", ttl: 1 },
  { type: "MX", name: `send.${ZONE_NAME}`, content: "feedback-smtp.us-east-1.amazonses.com", priority: 10, ttl: 1 },
  { type: "TXT", name: `send.${ZONE_NAME}`, content: "v=spf1 include:amazonses.com ~all", ttl: 1 },
];

let ok = true;
for (const rec of records) ok = (await upsert(rec)) && ok;

await zoneApi("/email/routing/enable", { method: "POST" });
console.log(ok ? "DNS_OK" : "DNS_PARTIAL");
