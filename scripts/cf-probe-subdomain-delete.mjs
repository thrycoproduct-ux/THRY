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

const paths = [
  ["DELETE", `/zones/${ZONE_ID}/email/routing/subdomains/${SEND_SUBDOMAIN_ID}`],
  ["PUT", `/zones/${ZONE_ID}/email/routing/subdomains/${SEND_SUBDOMAIN_ID}`, { enabled: false }],
  ["PATCH", `/zones/${ZONE_ID}/email/routing/subdomains/${SEND_SUBDOMAIN_ID}`, { enabled: false }],
  ["POST", `/zones/${ZONE_ID}/email/routing/subdomains/${SEND_SUBDOMAIN_ID}`, { enabled: false }],
  ["DELETE", `/zones/${ZONE_ID}/email/routing/subdomains/send.thryco.com`],
  ["POST", `/zones/${ZONE_ID}/email/routing/dns`, { name: "send.thryco.com", delete: true }],
  ["POST", `/zones/${ZONE_ID}/email/routing/dns`, { name: "send", unlock: true }],
];

for (const [method, urlPath, body] of paths) {
  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);
  const res = await fetch(`https://api.cloudflare.com/client/v4${urlPath}`, init);
  const text = await res.text();
  console.log(method, urlPath, res.status, text.slice(0, 300));
}
