import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const oauth = fs
  .readFileSync(
    path.join(os.homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml"),
    "utf8",
  )
  .match(/oauth_token = "([^"]+)"/)?.[1];

const userToken = fs.readFileSync(
  path.join(process.cwd(), ".cloudflare-dns.token"),
  "utf8",
).trim();

for (const [label, token] of [
  ["oauth", oauth],
  ["userToken", userToken],
]) {
  const r = await fetch(
    "https://api.cloudflare.com/client/v4/zones?name=thryco.com",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const j = await r.json();
  console.log(label, "zones", j.result?.length, j.result?.[0]?.id, j.errors?.[0]?.message);
  const dns = await fetch(
    "https://api.cloudflare.com/client/v4/zones/1b7976cc6df1e48295b653f94822ce56/dns_records?per_page=1",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const dj = await dns.json();
  console.log(label, "dnsRead", dj.success, dj.errors?.[0]?.message);
}
