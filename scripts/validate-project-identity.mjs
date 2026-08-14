#!/usr/bin/env node
/**
 * Validate local env + Wrangler configs against project.identity.json.
 *
 * Usage:
 *   node scripts/validate-project-identity.mjs
 *   node scripts/validate-project-identity.mjs --strict-wrangler-login
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import dotenv from "dotenv";
import {
  IDENTITY_PATH,
  PROJECT_ROOT,
  hostFromOrigin,
  loadProjectIdentity,
  readJsoncFile,
} from "./lib/load-project-identity.mjs";

const strictWranglerLogin = process.argv.includes("--strict-wrangler-login");
const identity = loadProjectIdentity();
const errors = [];
const warnings = [];

function err(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

function env(name) {
  return process.env[name]?.trim() || "";
}

// --- .env.local (if present) ---
const envLocalPath = path.join(PROJECT_ROOT, ".env.local");
if (!fs.existsSync(envLocalPath)) {
  warn(".env.local missing — skipping local env checks");
} else {
  const ref = env("NEXT_PUBLIC_SUPABASE_PROJECT_REF");
  const url = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const site = env("NEXT_PUBLIC_SITE_URL").replace(/\/$/, "");
  const bucket = env("NEXT_PUBLIC_S3_BUCKET");
  const endpoint = env("S3_ENDPOINT").replace(/\/$/, "");

  if (ref && ref !== identity.supabase.projectRef) {
    err(
      `NEXT_PUBLIC_SUPABASE_PROJECT_REF=${ref} ≠ identity ${identity.supabase.projectRef}`,
    );
  }
  if (url && url !== identity.supabase.url.replace(/\/$/, "")) {
    err(`NEXT_PUBLIC_SUPABASE_URL=${url} ≠ identity ${identity.supabase.url}`);
  }
  if (site) {
    const host = hostFromOrigin(site);
    if (identity.forbidden.siteHosts.map((h) => h.toLowerCase()).includes(host)) {
      err(`NEXT_PUBLIC_SITE_URL host "${host}" is forbidden for this project`);
    }
    const allowedHosts = new Set([
      hostFromOrigin(identity.site.canonicalOrigin),
      hostFromOrigin(identity.site.wwwOrigin),
      ...identity.site.localOrigins.map(hostFromOrigin),
    ]);
    if (!allowedHosts.has(host)) {
      err(
        `NEXT_PUBLIC_SITE_URL host "${host}" not in identity site hosts (${[...allowedHosts].join(", ")})`,
      );
    }
  }
  if (bucket && bucket !== identity.cloudflare.r2.mediaBucket) {
    err(
      `NEXT_PUBLIC_S3_BUCKET=${bucket} ≠ identity ${identity.cloudflare.r2.mediaBucket}`,
    );
  }
  if (
    endpoint &&
    endpoint !== identity.cloudflare.r2.s3Endpoint.replace(/\/$/, "")
  ) {
    err(
      `S3_ENDPOINT=${endpoint} ≠ identity ${identity.cloudflare.r2.s3Endpoint}`,
    );
  }
  const proxyUrl = env("R2_MEDIA_PROXY_URL").replace(/\/$/, "");
  const expectedProxy = identity.cloudflare.r2.mediaProxyUrl?.replace(
    /\/$/,
    "",
  );
  if (proxyUrl && expectedProxy && proxyUrl !== expectedProxy) {
    err(`R2_MEDIA_PROXY_URL=${proxyUrl} ≠ identity ${expectedProxy}`);
  }
  if (proxyUrl) {
    const proxyHost = hostFromOrigin(proxyUrl);
    if (
      identity.forbidden.siteHosts.map((h) => h.toLowerCase()).includes(proxyHost)
    ) {
      err(`R2_MEDIA_PROXY_URL host "${proxyHost}" is forbidden for this project`);
    }
  }
  const proxySecret = env("R2_MEDIA_PROXY_SECRET");
  if (proxyUrl && proxySecret && proxySecret.length < 16) {
    err("R2_MEDIA_PROXY_SECRET must be at least 16 characters");
  }
  for (const blocked of identity.forbidden.supabaseProjectRefs || []) {
    if (ref && ref === blocked) {
      err(`Supabase project ref ${ref} is forbidden`);
    }
  }
}

// --- Wrangler production config ---
const { path: wranglerPath, data: wrangler } = readJsoncFile(
  identity.cloudflare.productionWranglerConfig,
);
if (wrangler.name !== identity.cloudflare.workerName) {
  err(
    `${path.relative(PROJECT_ROOT, wranglerPath)} name="${wrangler.name}" ≠ identity workerName`,
  );
}
if (wrangler.account_id !== identity.cloudflare.accountId) {
  err(
    `${path.relative(PROJECT_ROOT, wranglerPath)} account_id ≠ identity cloudflare.accountId`,
  );
}
const r2Names = new Set((wrangler.r2_buckets || []).map((b) => b.bucket_name));
if (!r2Names.has(identity.cloudflare.r2.mediaBucket)) {
  err(`Wrangler missing R2 media bucket ${identity.cloudflare.r2.mediaBucket}`);
}
if (!r2Names.has(identity.cloudflare.r2.nextCacheBucket)) {
  err(
    `Wrangler missing R2 next-cache bucket ${identity.cloudflare.r2.nextCacheBucket}`,
  );
}

// --- Media proxy wrangler (optional file) ---
if (identity.cloudflare.mediaWranglerConfig) {
  const mediaConfigPath = path.join(
    PROJECT_ROOT,
    identity.cloudflare.mediaWranglerConfig,
  );
  if (fs.existsSync(mediaConfigPath)) {
    const { data: media } = readJsoncFile(mediaConfigPath);
    if (
      identity.cloudflare.mediaWorkerName &&
      media.name !== identity.cloudflare.mediaWorkerName
    ) {
      err(
        `Media worker name "${media.name}" ≠ identity ${identity.cloudflare.mediaWorkerName}`,
      );
    }
    if (media.account_id !== identity.cloudflare.accountId) {
      err("Media wrangler account_id ≠ identity cloudflare.accountId");
    }
  } else {
    warn(`Media wrangler config missing: ${identity.cloudflare.mediaWranglerConfig}`);
  }
}

// --- Optional live wrangler login check ---
if (strictWranglerLogin) {
  try {
    const wranglerCli = path.join(
      PROJECT_ROOT,
      "node_modules",
      "wrangler",
      "bin",
      "wrangler.js",
    );
    const out = fs.existsSync(wranglerCli)
      ? execFileSync(process.execPath, [wranglerCli, "whoami"], {
          cwd: PROJECT_ROOT,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
      : execFileSync("npx", ["wrangler", "whoami"], {
          cwd: PROJECT_ROOT,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          shell: true,
        });
    const emailMatch = out.match(/associated with the email\s+(\S+)/i);
    const accountMatch = out.match(
      /\|\s*([0-9a-f]{32})\s*\|/i,
    );
    const email = emailMatch?.[1]?.replace(/\.$/, "") || "";
    const accountId = accountMatch?.[1] || "";

    if (!out.includes("logged in")) {
      err("wrangler whoami: not authenticated — run npx wrangler login");
    }
    if (
      email &&
      identity.forbidden.cloudflareAccountEmails
        .map((e) => e.toLowerCase())
        .includes(email.toLowerCase())
    ) {
      err(`wrangler logged into forbidden account email: ${email}`);
    }
    if (email && email.toLowerCase() !== identity.cloudflare.accountEmail.toLowerCase()) {
      err(
        `wrangler email ${email} ≠ identity ${identity.cloudflare.accountEmail}`,
      );
    }
    if (accountId && accountId !== identity.cloudflare.accountId) {
      err(
        `wrangler account ${accountId} ≠ identity ${identity.cloudflare.accountId}`,
      );
    }
  } catch (error) {
    err(
      `wrangler whoami failed: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}

console.log(`[validate-identity] source: ${path.relative(PROJECT_ROOT, IDENTITY_PATH)}`);
console.log(
  `[validate-identity] project=${identity.project.slug} site=${identity.site.canonicalOrigin} supabase=${identity.supabase.projectRef} cf=${identity.cloudflare.accountId}`,
);

for (const message of warnings) {
  console.warn(`[validate-identity] WARN ${message}`);
}
if (errors.length > 0) {
  for (const message of errors) {
    console.error(`[validate-identity] FAIL ${message}`);
  }
  console.error(
    `[validate-identity] Fix project.identity.json and/or local configs, then re-run.`,
  );
  process.exit(1);
}

console.log("[validate-identity] OK");
