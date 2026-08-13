import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import postgres from "postgres";

function loadEnv(filePath) {
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[line.slice(0, i).trim()] = v;
  }
  return env;
}

const env = loadEnv(".env.local");
const oldCdn = (
  process.env.OLD_CDN_URL ||
  env.NEXT_PUBLIC_CDN_URL ||
  "https://pub-8ba09eae4a094c6cbdc094006fbc43af.r2.dev"
).replace(/\/$/, "");
const bucket = process.env.NEW_R2_BUCKET || "thry-cdn";
const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID || "";

if (!token) {
  console.error("Set CLOUDFLARE_API_TOKEN for the NEW Cloudflare account.");
  process.exit(1);
}

const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 1 });
const rows = await sql`select key from medias`;
await sql.end();

const keys = [
  ...new Set(
    rows
      .map((r) => String(r.key || "").trim())
      .filter(
        (k) =>
          k &&
          !k.startsWith("http") &&
          !k.startsWith("/") &&
          !k.startsWith("sakthi/"),
      ),
  ),
];

console.log(`Copying ${keys.length} object(s) from ${oldCdn} → ${bucket}`);

const tmpDir = path.join(".tmp-r2-copy");
fs.mkdirSync(tmpDir, { recursive: true });

let ok = 0;
let failed = 0;

for (const key of keys) {
  const url = `${oldCdn}/${key}`;
  const localFile = path.join(tmpDir, key.replace(/[\\/]/g, "__"));
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`GET fail ${res.status}: ${key}`);
      failed += 1;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(localFile, buf);

    const result = spawnSync(
      "npx",
      [
        "wrangler",
        "r2",
        "object",
        "put",
        `${bucket}/${key}`,
        "--file",
        localFile,
        "--remote",
        "--content-type",
        res.headers.get("content-type") || "application/octet-stream",
        "--config",
        "wrangler.workers.new-account.jsonc",
      ],
      {
        env: {
          ...process.env,
          CLOUDFLARE_API_TOKEN: token,
          CLOUDFLARE_ACCOUNT_ID: accountId,
        },
        encoding: "utf8",
        shell: true,
      },
    );

    if (result.status !== 0) {
      console.error(`PUT fail: ${key}\n${result.stderr || result.stdout}`);
      failed += 1;
      continue;
    }
    ok += 1;
    console.log(`OK ${key} (${buf.length} bytes)`);
  } catch (err) {
    console.error(`Error ${key}:`, err instanceof Error ? err.message : err);
    failed += 1;
  } finally {
    try {
      fs.unlinkSync(localFile);
    } catch {
      /* ignore */
    }
  }
}

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* ignore */
}

console.log(JSON.stringify({ ok, failed, total: keys.length }));
if (failed > 0) process.exit(1);
