import type { User } from "@supabase/supabase-js";
import { readSupabaseSessionCookie } from "@/lib/auth/middleware-session-cookie";

/**
 * Verify Supabase access tokens locally against the project's published
 * ES256 JWKS (same idea as supabase.auth.getClaims), so routine session checks
 * skip the network call to /auth/v1/user. Any doubt returns null and callers
 * fall back to supabase.auth.getUser().
 */

export type SupabaseJwtClaims = {
  sub: string;
  exp: number;
  iss: string;
  aud: string | string[];
  role: string;
  email?: string;
  phone?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  is_anonymous?: boolean;
};

type Jwks = { keys: Map<string, CryptoKey>; fetchedAt: number };

const JWKS_TTL_MS = 10 * 60_000;
const JWKS_MISS_REFETCH_MS = 60_000;
const CLOCK_SKEW_SECONDS = 10;

let jwksCache: Jwks | null = null;
let jwksInFlight: Promise<Jwks | null> | null = null;

function resolveSupabaseUrl(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const ref = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF?.trim();
  return ref ? `https://${ref}.supabase.co` : null;
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJsonSegment(segment: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(segment)),
    );
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function fetchJwks(
  supabaseUrl: string,
  fetchImpl: typeof fetch,
): Promise<Jwks | null> {
  try {
    const res = await fetchImpl(
      `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      {
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      keys?: Array<Record<string, unknown>>;
    };
    const keys = new Map<string, CryptoKey>();
    for (const jwk of body.keys ?? []) {
      if (
        jwk.kty !== "EC" ||
        jwk.crv !== "P-256" ||
        typeof jwk.kid !== "string"
      ) {
        continue;
      }
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "EC", crv: "P-256", x: jwk.x as string, y: jwk.y as string },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      keys.set(jwk.kid, key);
    }
    return { keys, fetchedAt: Date.now() };
  } catch {
    return null;
  }
}

async function getJwks(
  supabaseUrl: string,
  fetchImpl: typeof fetch,
  forceRefresh: boolean,
): Promise<Jwks | null> {
  const now = Date.now();
  const fresh = jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS;
  const missRefetchAllowed =
    !jwksCache || now - jwksCache.fetchedAt >= JWKS_MISS_REFETCH_MS;
  if (fresh && !(forceRefresh && missRefetchAllowed)) return jwksCache;

  jwksInFlight ??= fetchJwks(supabaseUrl, fetchImpl).finally(() => {
    jwksInFlight = null;
  });
  const next = await jwksInFlight;
  if (next) jwksCache = next;
  return jwksCache;
}

/** Signature + claims check. Returns null when the token is not provably valid. */
export async function verifySupabaseAccessToken(
  token: string,
  options: {
    minTtlSeconds?: number;
    nowMs?: number;
    supabaseUrl?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<SupabaseJwtClaims | null> {
  const supabaseUrl = options.supabaseUrl ?? resolveSupabaseUrl();
  if (!supabaseUrl) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const header = decodeJsonSegment(parts[0]);
  const payload = decodeJsonSegment(parts[1]);
  if (!header || !payload) return null;
  if (header.alg !== "ES256" || typeof header.kid !== "string") return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  let jwks = await getJwks(supabaseUrl, fetchImpl, false);
  let key = jwks?.keys.get(header.kid);
  if (!key) {
    jwks = await getJwks(supabaseUrl, fetchImpl, true);
    key = jwks?.keys.get(header.kid);
  }
  if (!key) return null;

  let signatureOk = false;
  try {
    signatureOk = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64UrlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return null;
  }
  if (!signatureOk) return null;

  const nowSeconds = (options.nowMs ?? Date.now()) / 1000;
  const minTtl = options.minTtlSeconds ?? 0;
  const { sub, exp, iss, aud, role } = payload;
  if (typeof sub !== "string" || sub.length === 0) return null;
  if (
    typeof exp !== "number" ||
    exp - CLOCK_SKEW_SECONDS - minTtl <= nowSeconds
  ) {
    return null;
  }
  if (iss !== `${supabaseUrl}/auth/v1`) return null;
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes("authenticated")) return null;
  if (role !== "authenticated") return null;

  return payload as unknown as SupabaseJwtClaims;
}

/**
 * Session user from the cookie when its access token verifies locally.
 * Identity and authorization fields come only from the signed claims.
 */
export async function getLocallyVerifiedUser(
  cookies: Array<{ name: string; value: string }>,
  options: { minTtlSeconds?: number } = {},
): Promise<User | null> {
  const session = readSupabaseSessionCookie(cookies);
  if (!session) return null;

  const claims = await verifySupabaseAccessToken(session.accessToken, options);
  if (!claims) return null;

  const cached = session.user?.id === claims.sub ? session.user : {};
  return {
    created_at: "",
    ...cached,
    id: claims.sub,
    aud: Array.isArray(claims.aud) ? claims.aud[0] : claims.aud,
    role: claims.role,
    email: claims.email,
    phone: claims.phone,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
    is_anonymous: claims.is_anonymous ?? false,
  } as User;
}

/** Test hook: reset the in-memory JWKS cache. */
export function resetJwksCacheForTests() {
  jwksCache = null;
  jwksInFlight = null;
}
