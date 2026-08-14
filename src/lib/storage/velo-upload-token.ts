import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_PREFIX = "uv1";
const DEFAULT_TTL_SECONDS = 10 * 60;

function mediaProxySecret(): string {
  const secret = process.env.R2_MEDIA_PROXY_SECRET?.trim();
  if (!secret) {
    throw new Error("R2 media proxy secret is not configured.");
  }
  return secret;
}

function mediaProxyBaseUrl(): string {
  const base = process.env.R2_MEDIA_PROXY_URL?.replace(/\/$/, "").trim();
  if (!base) {
    throw new Error("R2 media proxy URL is not configured.");
  }
  return base;
}

function signPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Short-lived client upload token for the THRY R2 media proxy.
 * Client PUTs bytes to thry-media; Vercel never sees the image body.
 */
export function createMediaProxyUploadToken(
  storagePath: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): { token: string; expiresAt: number } {
  const key = storagePath.trim();
  if (!key) throw new Error("storagePath is required.");
  if (!key.startsWith("uploads/staging/") || key.includes("..")) {
    throw new Error("Upload tokens are limited to staging keys.");
  }
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds);
  const secret = mediaProxySecret();
  const keyB64 = Buffer.from(key, "utf8").toString("base64url");
  const payload = `${TOKEN_PREFIX}:${exp}:${key}`;
  const sig = signPayload(secret, payload);
  return {
    token: `${TOKEN_PREFIX}.${exp}.${keyB64}.${sig}`,
    expiresAt: exp,
  };
}

/** Server-side verify (tests). Worker mirrors this verifier. */
export function verifyMediaProxyUploadToken(
  token: string,
  expectedKey: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const secret = process.env.R2_MEDIA_PROXY_SECRET?.trim();
  if (!secret) return false;
  const parts = token.trim().split(".");
  if (parts.length !== 4) return false;
  const [prefix, expRaw, keyB64, sig] = parts;
  if (prefix !== TOKEN_PREFIX) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < nowSeconds) return false;
  let key: string;
  try {
    key = Buffer.from(keyB64, "base64url").toString("utf8");
  } catch {
    return false;
  }
  if (key !== expectedKey.trim()) return false;
  const payload = `${TOKEN_PREFIX}:${exp}:${key}`;
  const expectedSig = signPayload(secret, payload);
  return safeEqual(sig, expectedSig);
}

export function mediaProxyUploadUrl(storagePath: string): string {
  return `${mediaProxyBaseUrl()}/object?key=${encodeURIComponent(storagePath)}`;
}
