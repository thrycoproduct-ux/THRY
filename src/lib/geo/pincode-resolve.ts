import "server-only";

import {
  fetchIndiaPostPincode,
  getLocalPincodeOverrides,
  lookupPincodeInDirectoryMap,
  normalizePincode,
  PINCODE_R2_OVERRIDES_KEY,
  pincodeShardObjectKey,
  type PincodeDirectoryMap,
  type PincodeLookupResult,
} from "@/lib/geo/pincode-lookup";

function parseDirectoryMapPayload(
  payload: unknown,
): PincodeDirectoryMap | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as PincodeDirectoryMap;
}

const r2JsonMemory = new Map<string, { expiresAt: number; value: unknown }>();
const R2_JSON_MEMORY_TTL_MS = 15 * 60 * 1000;

async function readR2JsonObject(key: string): Promise<unknown | null> {
  const cached = r2JsonMemory.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const { getObjectBuffer } = await import("@/lib/s3");
    const buffer = await getObjectBuffer({
      key,
      maxBytes: 8 * 1024 * 1024,
      auth: "trusted-server",
    });
    const parsed = JSON.parse(buffer.toString("utf8")) as unknown;
    r2JsonMemory.set(key, {
      value: parsed,
      expiresAt: Date.now() + R2_JSON_MEMORY_TTL_MS,
    });
    return parsed;
  } catch {
    return null;
  }
}

/** Test helper — clear in-process R2 JSON cache. */
export function clearPincodeR2MemoryCache(): void {
  r2JsonMemory.clear();
}

/**
 * R2 overrides (hotfix) → R2 shard → bundled seed overrides.
 * Safe when R2 objects are missing (returns null).
 */
export async function lookupPincodeFromR2(
  pin: string,
): Promise<PincodeLookupResult | null> {
  const normalized = normalizePincode(pin);
  if (!normalized) return null;

  const overridesPayload = await readR2JsonObject(PINCODE_R2_OVERRIDES_KEY);
  const fromR2Overrides = lookupPincodeInDirectoryMap(
    normalized,
    parseDirectoryMapPayload(overridesPayload),
  );
  if (fromR2Overrides) return fromR2Overrides;

  const shardPayload = await readR2JsonObject(
    pincodeShardObjectKey(normalized),
  );
  const fromShard = lookupPincodeInDirectoryMap(
    normalized,
    parseDirectoryMapPayload(shardPayload),
  );
  if (fromShard) return fromShard;

  return lookupPincodeInDirectoryMap(normalized, getLocalPincodeOverrides());
}

export type ResolvePincodeOptions = {
  /** Phase 2: try R2 before India Post. Default false (API primary). */
  primary?: "india-post" | "r2";
  fetchImpl?: typeof fetch;
  indiaPostTimeoutMs?: number;
  /** Inject R2 lookup in tests. */
  lookupR2?: (pin: string) => Promise<PincodeLookupResult | null>;
  lookupIndiaPost?: (pin: string) => Promise<PincodeLookupResult | null>;
};

/**
 * Production Phase 1: India Post → R2/local seed.
 * Set primary "r2" (or PINCODE_LOOKUP_PRIMARY=r2) to flip order later.
 */
export async function resolvePincode(
  pin: string,
  options: ResolvePincodeOptions = {},
): Promise<PincodeLookupResult | null> {
  const normalized = normalizePincode(pin);
  if (!normalized) return null;

  const envPrimary = process.env.PINCODE_LOOKUP_PRIMARY?.trim().toLowerCase();
  const primary =
    options.primary ?? (envPrimary === "r2" ? "r2" : "india-post");

  const lookupIndiaPost =
    options.lookupIndiaPost ??
    ((p: string) =>
      fetchIndiaPostPincode(p, options.fetchImpl, {
        timeoutMs: options.indiaPostTimeoutMs,
      }));
  const lookupR2 = options.lookupR2 ?? lookupPincodeFromR2;

  if (primary === "r2") {
    return (await lookupR2(normalized)) ?? (await lookupIndiaPost(normalized));
  }

  return (await lookupIndiaPost(normalized)) ?? (await lookupR2(normalized));
}

export class PincodeNotFoundError extends Error {
  readonly code = "PINCODE_NOT_FOUND" as const;

  constructor(pin: string) {
    super(`PINCODE_NOT_FOUND:${pin}`);
    this.name = "PincodeNotFoundError";
  }
}

export function isPincodeNotFoundError(
  error: unknown,
): error is PincodeNotFoundError {
  return (
    error instanceof PincodeNotFoundError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "PINCODE_NOT_FOUND")
  );
}
