import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ZONE_ID = "1b7976cc6df1e48295b653f94822ce56";
const SEND_SUBDOMAIN_ID = "145e14e2ebde4889833771c92b28516d";
const cfg = fs.readFileSync(
  path.join(os.homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml"),
  "utf8",
);
const token = cfg.match(/oauth_token = "([^"]+)"/)?.[1];
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function req(method, pathSuffix, body) {
  const init = { method, headers };
  if (body != null) init.body = JSON.stringify(body);
  const url = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}${pathSuffix}`;
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  console.log(method, pathSuffix, res.status, JSON.stringify(json).slice(0, 800));
  return json;
}

// Try disable/delete send subdomain from email routing
await req("GET", "/email/routing");
await req("DELETE", `/email/routing/subdomains/${SEND_SUBDOMAIN_ID}`);
await req("PATCH", `/email/routing/subdomains/${SEND_SUBDOMAIN_ID}`, {
  enabled: false,
});
await req("POST", `/email/routing/subdomains/${SEND_SUBDOMAIN_ID}/disable`);
await req("GET", "/email/routing/dns");
