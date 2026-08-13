import { INDIAN_STATES } from "@/features/addresses/constants/indianStates";

export const PINCODE_PATTERN = /^\d{6}$/;

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

const STATE_ALIASES: Record<string, (typeof INDIAN_STATES)[number]> = {
  orissa: "Odisha",
  odisha: "Odisha",
  pondicherry: "Puducherry",
  puducherry: "Puducherry",
  "nct of delhi": "Delhi",
  delhi: "Delhi",
  "andaman & nicobar islands": "Andaman and Nicobar Islands",
  "andaman and nicobar islands": "Andaman and Nicobar Islands",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "dadra and nagar haveli and daman and diu":
    "Dadra and Nagar Haveli and Daman and Diu",
  "jammu & kashmir": "Jammu and Kashmir",
  "jammu and kashmir": "Jammu and Kashmir",
};

export function normalizePincode(
  raw: string | null | undefined,
): string | null {
  const digits = String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);
  return PINCODE_PATTERN.test(digits) ? digits : null;
}

export function mapIndiaPostStateToCatalog(
  rawState: string | null | undefined,
): (typeof INDIAN_STATES)[number] | null {
  const normalized = String(rawState ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const alias = STATE_ALIASES[normalized];
  if (alias) return alias;

  const exact = INDIAN_STATES.find(
    (state) => state.toLowerCase() === normalized,
  );
  return exact ?? null;
}

type IndiaPostOffice = {
  Name?: string;
  District?: string;
  State?: string;
  Block?: string;
  Pincode?: string;
};

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
    const state = mapIndiaPostStateToCatalog(office.State);
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
