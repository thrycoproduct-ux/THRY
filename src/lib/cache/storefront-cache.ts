import { isControlFlowError, withRetry } from "@/lib/resilience";
import { STOREFRONT_REVALIDATE_SECONDS } from "./constants";
import { redisDel, redisDelByPrefix, redisGetChecked, redisSet } from "./redis";

type CacheOptions = {
  revalidate?: number;
  tags?: string[];
};

/**
 * Cached payloads carry their own freshness deadline so the entry can outlive
 * it. Once `freshUntil` passes we reload, but the stale copy stays available as
 * a fallback if the origin is failing (HTTP `stale-if-error` semantics).
 */
type CacheEnvelope<T> = {
  __swr: 1;
  value: T;
  freshUntil: number;
};

type MemoryEntry = {
  envelope: CacheEnvelope<unknown>;
  expiresAt: number;
  storedAt: number;
};

/**
 * Suffix (not prefix) so `redisDelByPrefix("sf:…")` invalidation keeps working.
 * Bump it whenever the stored shape changes, so instances running the previous
 * deployment never read a payload they cannot interpret.
 */
const REDIS_KEY_SUFFIX = "|v2";

const MAX_MEMORY_ENTRIES = 256;
/** How long a stale copy stays usable after it expires. */
const STALE_MULTIPLIER = 20;
const MIN_STALE_SECONDS = 900;
const MAX_STALE_SECONDS = 86_400;
/**
 * An isolate-local copy is trusted without re-checking shared caches only this
 * long, so an admin invalidation on one instance reaches every instance.
 */
const MEMORY_TRUST_MS = 30_000;
/**
 * Bound while Redis is unreachable on Workers, where a miss goes straight to
 * the origin. Elsewhere a miss falls through to the tag-aware Data Cache.
 */
const DEGRADED_WORKER_MEMORY_TRUST_MS = 120_000;
const memoryCache = new Map<string, MemoryEntry>();

function isCloudflareWorkerRuntime() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.userAgent === "string" &&
    navigator.userAgent.includes("Cloudflare-Workers")
  );
}

function staleTtlSeconds(revalidate: number) {
  return Math.min(
    MAX_STALE_SECONDS,
    Math.max(MIN_STALE_SECONDS, revalidate * STALE_MULTIPLIER),
  );
}

function isEnvelope<T>(value: unknown): value is CacheEnvelope<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as CacheEnvelope<T>).__swr === 1 &&
    typeof (value as CacheEnvelope<T>).freshUntil === "number"
  );
}

function memoryGet<T>(
  key: string,
): { envelope: CacheEnvelope<T>; storedAt: number } | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return {
    envelope: entry.envelope as CacheEnvelope<T>,
    storedAt: entry.storedAt,
  };
}

function memorySet<T>(
  key: string,
  envelope: CacheEnvelope<T>,
  ttlSeconds: number,
): void {
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }

  memoryCache.set(key, {
    envelope: envelope as CacheEnvelope<unknown>,
    expiresAt: Date.now() + Math.max(30, ttlSeconds) * 1000,
    storedAt: Date.now(),
  });
}

export function clearStorefrontMemoryCache(prefix?: string): void {
  if (!prefix) {
    memoryCache.clear();
    return;
  }

  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
}

/**
 * Removes exact keys and key prefixes from Redis and this isolate's memory.
 * Other isolates drop their copies within MEMORY_TRUST_MS.
 */
export async function clearStorefrontCacheEntries(params: {
  keys?: readonly string[];
  prefixes?: readonly string[];
}): Promise<void> {
  const keys = [...new Set(params.keys ?? [])];
  const prefixes = [...new Set(params.prefixes ?? [])];

  for (const key of keys) memoryCache.delete(key);
  for (const prefix of prefixes) clearStorefrontMemoryCache(prefix);

  await Promise.all([
    redisDel(keys.map((key) => key + REDIS_KEY_SUFFIX)),
    ...prefixes.map((prefix) => redisDelByPrefix(prefix)),
  ]);
}

type ReadResult<T> = {
  envelope: CacheEnvelope<T> | null;
  /** False when only an unverified isolate copy was found; reload to pick up invalidations. */
  trusted: boolean;
  /** True when Redis confirmed the entry just now, so the memory copy may restart its trust window. */
  verified: boolean;
};

/** Reads the newest envelope available, preferring shared Redis over the isolate. */
async function readEnvelope<T>(
  key: string,
  revalidate: number,
): Promise<ReadResult<T>> {
  const hit = memoryGet<T>(key);
  const local = hit?.envelope ?? null;
  const localAge = hit ? Date.now() - hit.storedAt : Number.POSITIVE_INFINITY;
  if (local && local.freshUntil > Date.now() && localAge < MEMORY_TRUST_MS) {
    return { envelope: local, trusted: true, verified: false };
  }

  const read = await redisGetChecked<unknown>(key + REDIS_KEY_SUFFIX);

  // Redis unavailable: it cannot report invalidations, so trust the local copy
  // for a bounded time.
  if (!read.ok) {
    const trustMs = isCloudflareWorkerRuntime()
      ? DEGRADED_WORKER_MEMORY_TRUST_MS
      : MEMORY_TRUST_MS;
    return { envelope: local, trusted: localAge < trustMs, verified: false };
  }

  const remote = read.value;
  // Missing from Redis means invalidated or evicted: reload, keeping the local
  // copy only as a stale-if-error fallback.
  if (remote === null || remote === undefined) {
    return { envelope: local, trusted: false, verified: false };
  }

  if (isEnvelope<T>(remote)) {
    if (local && local.freshUntil > remote.freshUntil) {
      return { envelope: local, trusted: true, verified: true };
    }
    return { envelope: remote, trusted: true, verified: true };
  }

  // Unexpected shape (hand-written key, partial rollout): treat as one fresh cycle.
  return {
    envelope: {
      __swr: 1,
      value: remote as T,
      freshUntil: Date.now() + revalidate * 1000,
    },
    trusted: true,
    verified: true,
  };
}

/**
 * Read-through cache: optional Upstash Redis (cross-instance) + Next.js Data Cache.
 * On Cloudflare Workers, skip `unstable_cache` — it can hang without a cache binding
 * and Cloudflare then returns Error 1101. Use a short-lived in-isolate memory cache
 * when Redis is not configured.
 *
 * Loaders are retried on transient transport faults. If they still fail, the last
 * known-good value is served rather than throwing a render-killing error.
 */
export async function withStorefrontCache<T>(
  key: string,
  loader: () => Promise<T>,
  options: CacheOptions = {},
): Promise<T> {
  const revalidate = options.revalidate ?? STOREFRONT_REVALIDATE_SECONDS;
  const staleTtl = staleTtlSeconds(revalidate);

  const {
    envelope: cached,
    trusted,
    verified,
  } = await readEnvelope<T>(key, revalidate);
  if (trusted && cached && cached.freshUntil > Date.now()) {
    if (verified) memorySet(key, cached, staleTtl);
    return cached.value;
  }

  const load = () => withRetry(loader, { label: `cache:${key}` });

  try {
    let value: T;

    if (isCloudflareWorkerRuntime()) {
      value = await load();
    } else {
      const { unstable_cache } = await import("next/cache");
      const tags = options.tags ?? [];
      value = await unstable_cache(load, [key], { revalidate, tags })();
    }

    const envelope: CacheEnvelope<T> = {
      __swr: 1,
      value,
      freshUntil: Date.now() + revalidate * 1000,
    };
    memorySet(key, envelope, staleTtl);
    void redisSet(key + REDIS_KEY_SUFFIX, envelope, staleTtl);
    return value;
  } catch (error) {
    if (isControlFlowError(error)) throw error;

    if (cached) {
      console.error(
        `[cache] loader failed for "${key}"; serving stale value:`,
        error instanceof Error ? error.message : error,
      );
      return cached.value;
    }

    throw error;
  }
}
