#!/usr/bin/env node
/**
 * Live checks for THRY media worker: health, CORS, server PUT, client token PUT.
 * Loads secrets from .env.local — never prints them.
 */
import path from "node:path";
import { createHmac } from "node:crypto";
import dotenv from "dotenv";
import {
  PROJECT_ROOT,
  loadProjectIdentity,
} from "./lib/load-project-identity.mjs";

dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

const identity = loadProjectIdentity();
const errors = [];

function fail(message) {
  errors.push(message);
}

function env(name) {
  return process.env[name]?.trim() || "";
}

const base = (env("R2_MEDIA_PROXY_URL") || identity.cloudflare.r2.mediaProxyUrl || "")
  .replace(/\/$/, "");
const secret = env("R2_MEDIA_PROXY_SECRET");
const expectedBase = identity.cloudflare.r2.mediaProxyUrl?.replace(/\/$/, "");

if (!base) fail("R2_MEDIA_PROXY_URL missing");
if (expectedBase && base !== expectedBase) {
  fail(`proxy URL ${base} ≠ identity ${expectedBase}`);
}
if (!secret || secret.length < 16) fail("R2_MEDIA_PROXY_SECRET missing or too short");
if (identity.cloudflare.r2.mediaBucket !== "thry-cdn") {
  fail("identity media bucket is not thry-cdn");
}

function signToken(storagePath, ttlSeconds = 300) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const keyB64 = Buffer.from(storagePath, "utf8").toString("base64url");
  const payload = `uv1:${exp}:${storagePath}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `uv1.${exp}.${keyB64}.${sig}`;
}

async function check(label, fn) {
  try {
    await fn();
    console.log(`[media-proxy] OK ${label}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`${label}: ${message}`);
    console.error(`[media-proxy] FAIL ${label}: ${message}`);
  }
}

if (errors.length > 0) {
  for (const message of errors) console.error(`[media-proxy] FAIL ${message}`);
  process.exit(1);
}

const allowedOrigin = "https://thryco.com";
const blockedOrigin = "https://hubsofcraftss.com";
const stagingKey = `uploads/staging/thry-probe-${Date.now()}.txt`;
const nonStagingKey = `healthcheck/thry-probe-${Date.now()}.txt`;

await check("GET /health", async () => {
  const res = await fetch(`${base}/health`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok !== true) {
    throw new Error(`status ${res.status}`);
  }
});

await check("CORS allow THRY Vercel origin", async () => {
  const res = await fetch(`${base}/object?key=${encodeURIComponent(stagingKey)}`, {
    method: "OPTIONS",
    headers: {
      Origin: allowedOrigin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  const allow = res.headers.get("access-control-allow-origin");
  if (res.status !== 204 && res.status !== 200) {
    throw new Error(`preflight status ${res.status}`);
  }
  if (allow !== allowedOrigin) {
    throw new Error(`ACAOrigin=${allow || "(none)"}`);
  }
});

await check("CORS deny foreign origin", async () => {
  const res = await fetch(`${base}/object?key=${encodeURIComponent(stagingKey)}`, {
    method: "OPTIONS",
    headers: {
      Origin: blockedOrigin,
      "Access-Control-Request-Method": "PUT",
    },
  });
  const allow = res.headers.get("access-control-allow-origin");
  if (allow === blockedOrigin || allow === "*") {
    throw new Error(`foreign origin was allowed (${allow})`);
  }
});

await check("PUT without auth is 401", async () => {
  const res = await fetch(`${base}/object?key=${encodeURIComponent(stagingKey)}`, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: "no-auth",
  });
  if (res.status !== 401) throw new Error(`status ${res.status}`);
});

await check("server PUT/GET/DELETE staging object", async () => {
  const put = await fetch(`${base}/object?key=${encodeURIComponent(stagingKey)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "text/plain",
    },
    body: "thry-proxy-ok",
  });
  if (!put.ok) throw new Error(`PUT ${put.status} ${(await put.text()).slice(0, 120)}`);

  const get = await fetch(`${base}/object?key=${encodeURIComponent(stagingKey)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await get.text();
  if (!get.ok || text !== "thry-proxy-ok") {
    throw new Error(`GET ${get.status} ${text.slice(0, 80)}`);
  }

  const del = await fetch(
    `${base}/object?key=${encodeURIComponent(stagingKey)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${secret}` },
    },
  );
  if (!del.ok) throw new Error(`DELETE ${del.status}`);
});

await check("client upload token PUT staging", async () => {
  const token = signToken(stagingKey);
  const put = await fetch(`${base}/object?key=${encodeURIComponent(stagingKey)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
      Origin: allowedOrigin,
    },
    body: "thry-token-ok",
  });
  if (!put.ok) throw new Error(`token PUT ${put.status} ${(await put.text()).slice(0, 120)}`);

  await fetch(`${base}/object?key=${encodeURIComponent(stagingKey)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${secret}` },
  });
});

await check("client token cannot PUT outside staging", async () => {
  const token = signToken(stagingKey);
  const put = await fetch(
    `${base}/object?key=${encodeURIComponent(nonStagingKey)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body: "blocked",
    },
  );
  if (put.status !== 401) throw new Error(`status ${put.status}`);
});

if (errors.length > 0) {
  console.error("[media-proxy] validation failed");
  process.exit(1);
}

console.log(`[media-proxy] OK worker=${base} bucket=${identity.cloudflare.r2.mediaBucket}`);
