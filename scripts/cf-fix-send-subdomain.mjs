import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ZONE_ID = "1b7976cc6df1e48295b653f94822ce56";
const cfg = fs.readFileSync(
  path.join(os.homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml"),
  "utf8",
);
const token = cfg.match(/oauth_token = "([^"]+)"/)?.[1];
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function cf(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, init);
  const json = await res.json();
  return { res, json };
}

// List DNS records on send subdomain
const list = await cf(`/zones/${ZONE_ID}/dns_records?name=send.thryco.com`, { headers });
console.log("list send records", list.res.status, list.json.success, list.json.result?.length);
if (list.json.result?.length) {
  for (const rec of list.json.result) {
    console.log(rec.id, rec.type, rec.name, rec.content, "proxied", rec.proxied);
  }
}

// Try delete email routing dns (API uses DELETE on collection)
const del = await cf(`/zones/${ZONE_ID}/email/routing/dns`, { method: "DELETE", headers });
console.log("DELETE routing/dns", del.res.status, JSON.stringify(del.json).slice(0, 500));

// List send again
const list2 = await cf(`/zones/${ZONE_ID}/dns_records?name=send.thryco.com`, { headers });
console.log("after delete", list2.json.result?.length, list2.json.errors);
