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

async function req(method, pathSuffix, body) {
  const init = { method, headers };
  if (body != null) init.body = JSON.stringify(body);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}${pathSuffix}`,
    init,
  );
  const json = await res.json();
  console.log(method, pathSuffix, res.status, JSON.stringify(json).slice(0, 600));
  return json;
}

await req("GET", "/email/routing/dns");
await req("GET", "/email/routing");
await req("DELETE", "/email/routing/dns");
await req("POST", "/email/routing/dns/unlock", { name: "send.thryco.com" });
await req("GET", "/email/routing/dns");
