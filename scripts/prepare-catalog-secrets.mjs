import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function readEnvLocal() {
  const envPath = path.join(root, ".env.local");
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = readEnvLocal();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY in .env.local");
  process.exit(1);
}

const syncSecret =
  env.CATALOG_SYNC_SECRET || crypto.randomBytes(32).toString("hex");

const secretsPath = path.join(root, "workers/thry-catalog/.secrets.local.json");
fs.writeFileSync(
  secretsPath,
  JSON.stringify(
    {
      CATALOG_SYNC_SECRET: syncSecret,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_ANON_KEY: anonKey,
    },
    null,
    2,
  ),
);
console.log("wrote", secretsPath);
console.log("syncSecretLength", syncSecret.length);
