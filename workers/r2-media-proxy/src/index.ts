/**
 * Thin R2 proxy for THRY on Vercel (no MEDIA_BUCKET on the Next host).
 *
 * Auth:
 * - Authorization: Bearer <MEDIA_PROXY_SECRET> (server / Vercel)
 * - Authorization: Bearer uv1.<exp>.<keyB64>.<sig> (short-lived client PUT
 *   to uploads/staging/* only — image bytes skip Vercel)
 *
 * Public CDN (no auth):
 * - GET /cdn/{options}/{key}  e.g. /cdn/w=400,q=75,f=webp/uploads/foo.png
 *   Resizes via Cloudflare Images binding over R2 originals.
 */

import { corsHeaders } from "./cors";

type R2ObjectBody = {
  size: number;
  body: ReadableStream | null;
  httpMetadata?: { contentType?: string };
};

type R2BucketBinding = {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | null,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
    },
  ) => Promise<unknown>;
  get: (key: string) => Promise<R2ObjectBody | null>;
  delete: (keys: string | string[]) => Promise<void>;
};

/** Minimal Images binding surface (Cloudflare Images Free supports R2 transforms). */
type ImagesBinding = {
  input: (stream: ReadableStream) => {
    transform: (opts: { width?: number; height?: number; fit?: string }) => {
      output: (opts: {
        format?: string;
        quality?: number;
      }) => Promise<{ response: () => Response }>;
    };
  };
};

export interface Env {
  MEDIA_BUCKET: R2BucketBinding;
  MEDIA_PROXY_SECRET: string;
  IMAGES: ImagesBinding;
}

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const TOKEN_PREFIX = "uv1";
const STAGING_PREFIX = "uploads/staging/";
const MAX_CDN_WIDTH = 1600;
const DEFAULT_CDN_WIDTH = 800;
const DEFAULT_CDN_QUALITY = 75;

function jsonResponse(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request),
    },
  });
}

function unauthorized(request: Request): Response {
  return jsonResponse(request, { error: "Unauthorized" }, 401);
}

function badRequest(request: Request, message: string): Response {
  return jsonResponse(request, { error: message }, 400);
}

function extractBearer(request: Request): string {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();
}

function sanitizeKey(raw: string | null): string | null {
  if (!raw) return null;
  const key = decodeURIComponent(raw).trim();
  if (!key || key.includes("..") || key.includes("\\") || key.startsWith("/")) {
    return null;
  }
  return key;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 1) {
    binary += String.fromCharCode(view[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return bytesToBase64Url(sig);
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

async function verifyUploadToken(
  token: string,
  expectedKey: string,
  secret: string,
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [prefix, expRaw, keyB64, sig] = parts;
  if (prefix !== TOKEN_PREFIX) return false;
  const exp = Number(expRaw);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(exp) || exp < now) return false;
  let key: string;
  try {
    key = new TextDecoder().decode(base64UrlToBytes(keyB64));
  } catch {
    return false;
  }
  if (key !== expectedKey) return false;
  // Client tokens may only write staging keys.
  if (!key.startsWith(STAGING_PREFIX)) return false;
  const payload = `${TOKEN_PREFIX}:${exp}:${key}`;
  const expectedSig = await hmacSign(secret, payload);
  return timingSafeEqualString(sig, expectedSig);
}

async function authorizeRequest(
  request: Request,
  env: Env,
  objectKey: string | null,
): Promise<"server" | "upload" | null> {
  const expected = env.MEDIA_PROXY_SECRET?.trim();
  if (!expected) return null;
  const token = extractBearer(request);
  if (!token) return null;
  if (token === expected) return "server";
  if (objectKey && token.startsWith(`${TOKEN_PREFIX}.`)) {
    const ok = await verifyUploadToken(token, objectKey, expected);
    return ok ? "upload" : null;
  }
  return null;
}

type CdnOptions = {
  width: number;
  quality: number;
  format: "image/webp" | "image/avif" | "image/jpeg";
};

function parseCdnFormat(raw: string | undefined): CdnOptions["format"] | null {
  const v = (raw || "webp").toLowerCase();
  if (v === "webp") return "image/webp";
  if (v === "avif") return "image/avif";
  if (v === "jpeg" || v === "jpg") return "image/jpeg";
  return null;
}

function parseCdnOptions(raw: string): CdnOptions | null {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  let width = DEFAULT_CDN_WIDTH;
  let quality = DEFAULT_CDN_QUALITY;
  let format: CdnOptions["format"] = "image/webp";

  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    const k = part.slice(0, eq).toLowerCase();
    const v = part.slice(eq + 1);
    if (k === "w" || k === "width") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 16 || n > MAX_CDN_WIDTH) return null;
      width = Math.round(n);
    } else if (k === "q" || k === "quality") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 20 || n > 100) return null;
      quality = Math.round(n);
    } else if (k === "f" || k === "format") {
      const fmt = parseCdnFormat(v);
      if (!fmt) return null;
      format = fmt;
    } else {
      return null;
    }
  }

  return { width, quality, format };
}

/** Public product media only — never expose arbitrary bucket paths. */
function isPublicCdnKey(key: string): boolean {
  return key.startsWith("uploads/") && !key.includes("..");
}

async function handleCdnGet(
  request: Request,
  env: Env,
  optionsRaw: string,
  keyRaw: string,
): Promise<Response> {
  const opts = parseCdnOptions(optionsRaw);
  if (!opts) return badRequest(request, "Invalid CDN options.");

  const key = sanitizeKey(keyRaw);
  if (!key || !isPublicCdnKey(key)) {
    return badRequest(request, "Missing or invalid key.");
  }

  if (!env.IMAGES) {
    return jsonResponse(
      request,
      { error: "Images binding is not configured." },
      503,
    );
  }

  const cache = caches.default;
  const cacheHit = await cache.match(request);
  if (cacheHit) return cacheHit;

  const obj = await env.MEDIA_BUCKET.get(key);
  if (!obj?.body) {
    return jsonResponse(request, { error: "Not found" }, 404);
  }

  try {
    const transformed = await env.IMAGES.input(obj.body)
      .transform({ width: opts.width, fit: "scale-down" })
      .output({ format: opts.format, quality: opts.quality });

    const imageResponse = transformed.response();
    const headers = new Headers(imageResponse.headers);
    headers.set(
      "Cache-Control",
      "public, max-age=31536000, stale-while-revalidate=86400, immutable",
    );
    Object.entries(corsHeaders(request)).forEach(([k, v]) => headers.set(k, v));

    const response = new Response(imageResponse.body, {
      status: 200,
      headers,
    });
    // Cache successful transforms at the edge.
    await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transform failed";
    console.error("[cdn] transform failed:", key, message);
    return jsonResponse(request, { error: "Image transform failed." }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(request, {
        ok: true,
        images: Boolean(env.IMAGES),
      });
    }

    // Public resize: /cdn/{options}/{key...}
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      url.pathname.startsWith("/cdn/")
    ) {
      const rest = url.pathname.slice("/cdn/".length);
      const slash = rest.indexOf("/");
      if (slash <= 0) {
        return badRequest(request, "Expected /cdn/{options}/{key}");
      }
      const optionsRaw = rest.slice(0, slash);
      const keyRaw = rest.slice(slash + 1);
      const response = await handleCdnGet(request, env, optionsRaw, keyRaw);
      if (request.method === "HEAD") {
        return new Response(null, {
          status: response.status,
          headers: response.headers,
        });
      }
      return response;
    }

    if (url.pathname !== "/object") {
      return badRequest(request, "Unknown path.");
    }

    const objectKey = sanitizeKey(url.searchParams.get("key"));
    const auth = await authorizeRequest(request, env, objectKey);
    if (!auth) return unauthorized(request);

    // Upload tokens: PUT staging only.
    if (auth === "upload" && request.method !== "PUT") {
      return unauthorized(request);
    }

    if (request.method === "PUT") {
      const key = objectKey;
      if (!key) return badRequest(request, "Missing or invalid key.");
      if (auth === "upload" && !key.startsWith(STAGING_PREFIX)) {
        return unauthorized(request);
      }

      const contentLength = Number(request.headers.get("content-length") || 0);
      if (
        Number.isFinite(contentLength) &&
        contentLength > 0 &&
        contentLength > MAX_BODY_BYTES
      ) {
        return badRequest(request, "Body too large.");
      }

      const body = await request.arrayBuffer();
      if (body.byteLength === 0) return badRequest(request, "Empty body.");
      if (body.byteLength > MAX_BODY_BYTES) {
        return badRequest(request, "Body too large.");
      }

      const contentType =
        request.headers.get("content-type") || "application/octet-stream";
      const cacheControl = request.headers.get("cache-control") || undefined;

      await env.MEDIA_BUCKET.put(key, body, {
        httpMetadata: {
          contentType,
          cacheControl,
        },
      });

      return jsonResponse(request, { ok: true, key });
    }

    if (request.method === "GET") {
      const key = objectKey;
      if (!key) return badRequest(request, "Missing or invalid key.");

      const obj = await env.MEDIA_BUCKET.get(key);
      if (!obj) {
        return jsonResponse(request, { error: "Not found" }, 404);
      }

      const headers = new Headers(corsHeaders(request));
      const ct = obj.httpMetadata?.contentType;
      if (ct) headers.set("Content-Type", ct);
      headers.set("Content-Length", String(obj.size));
      return new Response(obj.body, { status: 200, headers });
    }

    if (request.method === "DELETE") {
      let keys: string[] = [];
      if (objectKey) {
        keys = [objectKey];
      } else {
        const json = (await request.json().catch(() => null)) as {
          keys?: unknown;
        } | null;
        if (!json || !Array.isArray(json.keys)) {
          return badRequest(request, "Expected { keys: string[] }.");
        }
        keys = [
          ...new Set(
            json.keys
              .filter((k): k is string => typeof k === "string")
              .map((k) => sanitizeKey(k))
              .filter((k): k is string => Boolean(k)),
          ),
        ];
      }
      if (keys.length === 0) return badRequest(request, "No keys.");
      await env.MEDIA_BUCKET.delete(keys);
      return jsonResponse(request, { ok: true, deleted: keys.length });
    }

    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders(request),
    });
  },
};
