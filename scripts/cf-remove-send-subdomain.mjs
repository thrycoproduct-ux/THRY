import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ZONE_ID = "1b7976cc6df1e48295b653f94822ce56";
const SEND_SUBDOMAIN_ID = "145e14e2ebde4889833771c92b28516d";
const oauth = fs
  .readFileSync(
    path.join(os.homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml"),
    "utf8",
  )
  .match(/oauth_token = "([^"]+)"/)?.[1];

const headers = { Authorization: `Bearer ${oauth}`, "Content-Type": "application/json" };

async function req(method, suffix, body) {
  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}${suffix}`, init);
  const json = await res.json();
  console.log(method, suffix, res.status, json.success, json.errors?.[0]?.message ?? json.result?.status ?? "");
  return json;
}

await req("POST", "/email/routing/disable");
await req("DELETE", "/email/routing/dns");
await req("PUT", "/email/routing", { enabled: false, subdomains: [] });
await req("DELETE", `/email/routing/subdomains/${SEND_SUBDOMAIN_ID}`);
await req("GET", "/email/routing");
