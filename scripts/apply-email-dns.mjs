/**
 * Apply thryco.com email DNS using .cloudflare-dns.token
 * Usage: node scripts/apply-email-dns.mjs
 *   or:  set CLOUDFLARE_API_TOKEN=... && node scripts/apply-email-dns.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import readline from "node:readline";

const root = process.cwd();
const tokenPath = path.join(root, ".cloudflare-dns.token");

function loadToken() {
  if (process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    return process.env.CLOUDFLARE_API_TOKEN.trim();
  }
  if (fs.existsSync(tokenPath)) {
    return fs.readFileSync(tokenPath, "utf8").trim();
  }
  return null;
}

async function promptToken() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const token = await new Promise((resolve) => {
    rl.question("Paste Cloudflare API token (Zone DNS Edit on thryco.com): ", resolve);
  });
  rl.close();
  return token.trim();
}

let token = loadToken();
if (!token) {
  token = await promptToken();
  if (!token) {
    console.error("No token provided.");
    process.exit(1);
  }
  fs.writeFileSync(tokenPath, token, "utf8");
  console.log("Saved to .cloudflare-dns.token");
}

process.env.CLOUDFLARE_API_TOKEN = token;

const fix = spawnSync(process.execPath, ["scripts/cf-fix-email-full.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

if (fix.status !== 0) {
  spawnSync(process.execPath, ["scripts/cf-fix-thryco-email-dns.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}

const resend = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".resend/bin/resend.exe",
);
if (fs.existsSync(resend)) {
  spawnSync(resend, ["domains", "verify", "ef23a9b0-9145-4f59-84fc-0c3a795a06b6"], {
    stdio: "inherit",
  });
  spawnSync(resend, ["domains", "get", "ef23a9b0-9145-4f59-84fc-0c3a795a06b6"], {
    stdio: "inherit",
  });
}
