import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const root = process.cwd();

function loadEnv() {
  const out = {};
  for (const f of [".env.local", ".env"]) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      out[line.slice(0, i).trim()] = line
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

function readWranglerOauth() {
  const candidates = [
    join(process.env.APPDATA || "", "xdg.config/.wrangler/config/default.toml"),
    join(homedir(), ".config/.wrangler/config/default.toml"),
    join(homedir(), ".wrangler/config/default.toml"),
  ];
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    const t = readFileSync(c, "utf8");
    const m = t.match(/oauth_token\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  return "";
}

const env = loadEnv();
const token = env.CLOUDFLARE_API_TOKEN?.trim() || readWranglerOauth();
if (!token) {
  console.log(JSON.stringify({ error: "NO_CF_TOKEN" }));
  process.exit(0);
}

const headers = { Authorization: `Bearer ${token}` };
const accounts = await fetch(
  "https://api.cloudflare.com/client/v4/accounts?per_page=50",
  { headers },
).then((r) => r.json());
const zones = await fetch(
  "https://api.cloudflare.com/client/v4/zones?per_page=50",
  { headers },
).then((r) => r.json());

console.log(
  JSON.stringify(
    {
      accounts: {
        success: accounts.success,
        errors: accounts.errors,
        list: (accounts.result || []).map((a) => ({ id: a.id, name: a.name })),
      },
      zones: {
        success: zones.success,
        errors: zones.errors,
        list: (zones.result || []).map((z) => ({
          id: z.id,
          name: z.name,
          account: z.account?.id,
        })),
      },
    },
    null,
    2,
  ),
);

const zone =
  (zones.result || []).find((z) => z.name === "thryco.com") ||
  zones.result?.[0];
if (!zone?.id) process.exit(0);

const end = new Date();
const start = new Date(Date.now() - 7 * 864e5);
const dateGeq = start.toISOString().slice(0, 10);
const dateLeq = end.toISOString().slice(0, 10);

const query = `
query {
  viewer {
    zones(filter: { zoneTag: "${zone.id}" }) {
      httpRequests1dGroups(
        limit: 14
        filter: { date_geq: "${dateGeq}", date_leq: "${dateLeq}" }
        orderBy: [date_ASC]
      ) {
        dimensions { date }
        sum {
          requests
          uniques
          bytes
          cachedRequests
          pageViews
        }
      }
    }
  }
}
`;

const gql = await fetch("https://api.cloudflare.com/client/v4/graphql", {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
}).then((r) => r.json());

console.log(
  JSON.stringify(
    {
      zone: { id: zone.id, name: zone.name },
      range: { dateGeq, dateLeq },
      groups: gql?.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? null,
      errors: gql.errors ?? null,
    },
    null,
    2,
  ),
);
