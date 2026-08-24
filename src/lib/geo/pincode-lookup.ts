import { INDIAN_STATES } from "@/features/addresses/constants/indianStates";

export const PINCODE_PATTERN = /^\d{6}$/;

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

export async function fetchIndiaPostPincode(
  pin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PincodeLookupResult | null> {
  const normalized = normalizePincode(pin);
  if (!normalized) return null;

  const response = await fetchImpl(
    `https://api.postalpincode.in/pincode/${normalized}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as unknown;
  return parseIndiaPostPincodeResponse(normalized, payload);
}
