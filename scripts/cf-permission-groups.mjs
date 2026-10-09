import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cfg = fs.readFileSync(
  path.join(os.homedir(), "AppData/Roaming/xdg.config/.wrangler/config/default.toml"),
  "utf8",
);
const oauth = cfg.match(/oauth_token = "([^"]+)"/)?.[1];
const r = await fetch(
  "https://api.cloudflare.com/client/v4/user/tokens/permission_groups",
  { headers: { Authorization: `Bearer ${oauth}` } },
);
const j = await r.json();
console.log("status", r.status, "success", j.success, "errors", j.errors);
const pick = (j.result ?? []).filter((p) =>
  /Zone DNS Edit|Email Routing Rules Edit|Email Routing/i.test(p.name),
);
for (const p of pick) console.log(p.id, p.name);
