import { INDIAN_STATES } from "@/features/addresses/constants/indianStates";
import localPincodeOverrides from "@/lib/geo/pincode-overrides.seed.json";

export const PINCODE_PATTERN = /^\d{6}$/;

/** R2 object keys for the offline PIN directory (media bucket). */
export const PINCODE_R2_OVERRIDES_KEY = "geo/pincode-overrides.json";

export function pincodeShardObjectKey(pin: string): string {
  return `geo/pincode/${pin.slice(0, 3)}.json`;
}

export type CatalogState = (typeof INDIAN_STATES)[number];

export type PincodeLocality = {
  name: string;
  district: string;
  state: string;
};

export type PincodeLookupResult = {
  pin: string;
  state: string;
  district: string;
  city: string;
  areas: string[];
  localities: PincodeLocality[];
};

/** Compact directory row stored on R2 / local seed. */
export type PincodeDirectoryEntry = {
  state: string;
  district: string;
  office?: string;
};

export type PincodeDirectoryMap = Record<string, PincodeDirectoryEntry>;

/**
 * Map India Post / GST former names onto ISO 3166-2:IN + GST master labels.
 * Keys must already be passed through `normalizeStateKey`.
 */
const STATE_ALIASES: Record<string, CatalogState> = {
  // India Post directory still uses the one-t spelling.
  chattisgarh: "Chhattisgarh",
  // Renamed states / UTs (ISO + GST).
  orissa: "Odisha",
  pondicherry: "Puducherry",
  uttaranchal: "Uttarakhand",
  laccadive: "Lakshadweep",
  laccadives: "Lakshadweep",
  "laccadive islands": "Lakshadweep",
  "lakshadweep islands": "Lakshadweep",
  // Delhi variants from postal + GST masters.
  "nct of delhi": "Delhi",
  "nct delhi": "Delhi",
  "national capital territory of delhi": "Delhi",
  "new delhi": "Delhi",
  // Merged UT (GST 26, ISO IN-DH).
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "the dadra and nagar haveli and daman and diu":
    "Dadra and Nagar Haveli and Daman and Diu",
  "dadra nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "daman diu": "Dadra and Nagar Haveli and Daman and Diu",
};

const LADAKH_DISTRICTS = new Set(["leh", "kargil", "leh ladakh", "ladakh"]);

/** India Post HTTP timeout before falling back to R2. */
export const INDIA_POST_LOOKUP_TIMEOUT_MS = 2000;

export function normalizePincode(
  raw: string | null | undefined,
): string | null {
  const digits = String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);
  return PINCODE_PATTERN.test(digits) ? digits : null;
}

export function normalizeStateKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactStateKey(key: string): string {
  return key.replace(/\s+/g, "");
}

export function mapIndiaPostStateToCatalog(
  rawState: string | null | undefined,
): CatalogState | null {
  const normalized = normalizeStateKey(rawState);
  if (!normalized) return null;

  const alias = STATE_ALIASES[normalized];
  if (alias) return alias;

  const exact = INDIAN_STATES.find(
    (state) => normalizeStateKey(state) === normalized,
  );
  if (exact) return exact;

  const withIslands = `${normalized} islands`;
  const islandsMatch = INDIAN_STATES.find(
    (state) => normalizeStateKey(state) === withIslands,
  );
  if (islandsMatch) return islandsMatch;

  const compact = compactStateKey(normalized);
  const compactMatch = INDIAN_STATES.find(
    (state) => compactStateKey(normalizeStateKey(state)) === compact,
  );
  return compactMatch ?? null;
}

type IndiaPostOffice = {
  Name?: string;
  District?: string;
  State?: string;
  Block?: string;
  Pincode?: string;
};

function isLadakhOffice(office: IndiaPostOffice, pin: string): boolean {
  const district = normalizeStateKey(office.District);
  if (LADAKH_DISTRICTS.has(district)) return true;
  // India Post sorting district 194 is Ladakh (GST 38 / ISO IN-LA).
  return pin.startsWith("194");
}

export function resolveIndiaPostOfficeState(
  office: Pick<IndiaPostOffice, "State" | "District">,
  pin: string,
): CatalogState | null {
  const mapped = mapIndiaPostStateToCatalog(office.State);
  if (!mapped) return null;
  if (mapped === "Jammu and Kashmir" && isLadakhOffice(office, pin)) {
    return "Ladakh";
  }
  return mapped;
}

type IndiaPostResponseItem = {
  Status?: string;
  Message?: string;
  PostOffice?: IndiaPostOffice[] | null;
};

export function parseIndiaPostPincodeResponse(
  pin: string,
  payload: unknown,
): PincodeLookupResult | null {
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const item = payload[0] as IndiaPostResponseItem;
  if (String(item.Status ?? "").toLowerCase() !== "success") return null;
  const offices = Array.isArray(item.PostOffice) ? item.PostOffice : [];
  if (offices.length === 0) return null;

  const localities: PincodeLocality[] = [];
  for (const office of offices) {
    const state = resolveIndiaPostOfficeState(office, pin);
    if (!state) continue;
    const name = String(office.Name ?? "").trim();
    const district = String(office.District ?? "").trim();
    if (!name && !district) continue;
    localities.push({
      name: name || district,
      district: district || name,
      state,
    });
  }

  if (localities.length === 0) return null;

  const primary = localities[0]!;
  const areas = Array.from(
    new Set(localities.map((item) => item.name).filter(Boolean)),
  );

  return {
    pin,
    state: primary.state,
    district: primary.district,
    city: primary.district || primary.name,
    areas,
    localities,
  };
}

export function parsePincodeDirectoryEntry(
  pin: string,
  entry: PincodeDirectoryEntry | null | undefined,
): PincodeLookupResult | null {
  if (!entry) return null;
  const state = mapIndiaPostStateToCatalog(entry.state);
  if (!state) return null;
  const district = String(entry.district ?? "").trim();
  const office = String(entry.office ?? "").trim();
  if (!district && !office) return null;
  const name = office || district;
  const districtLabel = district || office;
  return {
    pin,
    state,
    district: districtLabel,
    city: districtLabel,
    areas: name ? [name] : [],
    localities: [
      {
        name,
        district: districtLabel,
        state,
      },
    ],
  };
}

export function lookupPincodeInDirectoryMap(
  pin: string,
  map: PincodeDirectoryMap | null | undefined,
): PincodeLookupResult | null {
  if (!map || typeof map !== "object") return null;
  return parsePincodeDirectoryEntry(pin, map[pin]);
}

function parseDirectoryMapPayload(payload: unknown): PincodeDirectoryMap | null {
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

export function getLocalPincodeOverrides(): PincodeDirectoryMap {
  return localPincodeOverrides as PincodeDirectoryMap;
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

export async function fetchIndiaPostPincode(
  pin: string,
  fetchImpl: typeof fetch = fetch,
  options?: { timeoutMs?: number },
): Promise<PincodeLookupResult | null> {
  const normalized = normalizePincode(pin);
  if (!normalized) return null;

  const timeoutMs = options?.timeoutMs ?? INDIA_POST_LOOKUP_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(
      `https://api.postalpincode.in/pincode/${normalized}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    return parseIndiaPostPincodeResponse(normalized, payload);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
    return (
      (await lookupR2(normalized)) ?? (await lookupIndiaPost(normalized))
    );
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
