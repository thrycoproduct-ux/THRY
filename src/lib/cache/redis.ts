/**
 * Minimal Upstash Redis REST client for the storefront cache.
 *
 * Why not @upstash/redis: the SDK forces `cache: "no-store"` on every fetch.
 * Next.js treats a no-store fetch as "this route is dynamic", so on static/ISR
 * pages every Redis call threw DynamicServerError (cache silently disabled)
 * and background revalidation failed with "Page changed from static to
 * dynamic at runtime" — burning Worker CPU until Error 1102.
 *
 * This client sends the same REST commands with the unpatched fetch, so cache
 * reads/writes are invisible to Next's static rendering. That is correct:
 * Redis here is our own cache transport, not page data fetching.
 *
 * Wire format stays compatible with values written by @upstash/redis
 * (JSON.stringify on SET, JSON.parse on GET).
 */

const REDIS_TIMEOUT_MS = 1500;

type RedisRestConfig = { url: string; token: string };

let config: RedisRestConfig | null | undefined;

function getConfig(): RedisRestConfig | null {
  if (config !== undefined) return config;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  config = url && token ? { url: url.replace(/\/+$/, ""), token } : null;
  return config;
}

type NextPatchedFetch = typeof fetch & { _nextOriginalFetch?: typeof fetch };

/**
 * Next.js patches global fetch to track caching; use the original it keeps on
 * `_nextOriginalFetch` so Redis I/O never marks a page as dynamic. The plain
 * global fetch fallback is also safe (we never pass a `cache` option).
 */
function resolveFetch(): typeof fetch {
  const patched = globalThis.fetch as NextPatchedFetch;
  const original = patched._nextOriginalFetch ?? patched;
  return original.bind(globalThis);
}

function timeoutSignal(): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(REDIS_TIMEOUT_MS);
  } catch {
    return undefined;
  }
}

async function redisCommand(
  command: (string | number)[],
): Promise<unknown | null> {
  const cfg = getConfig();
  if (!cfg) return null;

  const doFetch = resolveFetch();
  const response = await doFetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    signal: timeoutSignal(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Upstash ${response.status} for ${String(command[0])}: ${text.slice(0, 200)}`,
    );
  }

  const payload = (await response.json()) as {
    result?: unknown;
    error?: string;
  };
  if (payload.error) {
    throw new Error(
      `Upstash error for ${String(command[0])}: ${payload.error}`,
    );
  }
  return payload.result ?? null;
}

export function isRedisCacheEnabled() {
  return getConfig() !== null;
}

function parseRedisValue<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return raw as T;

  try {
    return JSON.parse(raw) as T;
  } catch {
    // Value predates JSON serialization; return it as-is.
    return raw as unknown as T;
  }
}

export async function redisGet<T>(key: string): Promise<T | null> {
  try {
    return parseRedisValue<T>(await redisCommand(["GET", key]));
  } catch (error) {
    console.warn("[cache] Redis GET failed:", error);
    return null;
  }
}

/**
 * Like redisGet, but tells "key missing" apart from "Redis unavailable"
 * (not configured, quota exceeded, timeout).
 */
export async function redisGetChecked<T>(
  key: string,
): Promise<{ ok: true; value: T | null } | { ok: false }> {
  if (!getConfig()) return { ok: false };
  try {
    return {
      ok: true,
      value: parseRedisValue<T>(await redisCommand(["GET", key])),
    };
  } catch (error) {
    console.warn("[cache] Redis GET failed:", error);
    return { ok: false };
  }
}

export async function redisSet<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  try {
    await redisCommand([
      "SET",
      key,
      JSON.stringify(value),
      "EX",
      Math.max(30, Math.floor(ttlSeconds)),
    ]);
  } catch (error) {
    console.warn("[cache] Redis SET failed:", error);
  }
}

export async function redisDel(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await redisCommand(["DEL", ...keys]);
  } catch (error) {
    console.warn("[cache] Redis DEL failed:", error);
  }
}

export async function redisDelByPrefix(prefix: string): Promise<void> {
  try {
    const keys = await redisCommand(["KEYS", `${prefix}*`]);
    if (Array.isArray(keys) && keys.length > 0) {
      await redisCommand(["DEL", ...keys.map(String)]);
    }
  } catch (error) {
    console.warn("[cache] Redis DEL failed:", error);
  }
}
