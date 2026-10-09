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

const bodies = [{}, { name: "send.thryco.com" }, { name: "send" }, { skip_wizard: true }];

for (const body of bodies) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/email/routing/dns`,
    { method: "POST", headers, body: JSON.stringify(body) },
  );
  const json = await res.json();
  console.log("body", JSON.stringify(body), res.status, json.success, json.errors?.[0]?.message ?? "ok");
}
