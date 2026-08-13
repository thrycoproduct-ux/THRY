import { readFileSync } from "node:fs";
import { join } from "node:path";

const accountId = "77dfa9b757691b2321fe0630f01c8c6a";
const toml = readFileSync(
  join(process.env.APPDATA, "xdg.config/.wrangler/config/default.toml"),
  "utf8",
);
const oauth = (toml.match(/oauth_token\s*=\s*"([^"]+)"/) || [])[1];
if (!oauth) {
  console.error("NO_OAUTH");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${oauth}`,
  "Content-Type": "application/json",
};

const getRes = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
  { headers },
);
const getJson = await getRes.json();
console.log("GET", getRes.status, JSON.stringify(getJson));

if (!getJson.success || !getJson.result?.subdomain) {
  const putRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ subdomain: "thrycoproduct" }),
    },
  );
  const putJson = await putRes.json();
  console.log("PUT", putRes.status, JSON.stringify(putJson));
}
