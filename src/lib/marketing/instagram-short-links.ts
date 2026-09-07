/**
 * Short, typeable Instagram campaign links: thryco.com/ig/<code>.
 *
 * Instagram renders raw URLs in DMs as non-tappable text for non-followers /
 * pending message requests, and does not report DM link clicks. These short
 * paths are easy to type manually and tag the visit with UTM params so DM
 * traffic is measurable in analytics.
 *
 * Unknown codes fall back to /collections/<code> so a marketer can use any
 * collection slug without a code change.
 */
export const INSTAGRAM_SHORT_LINKS: Readonly<Record<string, string>> = {
  dual: "/collections/dual-stamp-collections",
  blocks: "/collections/fabric-printing-blocks-collections",
  clay: "/collections/art-craft",
  resin: "/collections/3d-printed-statues",
  stl: "/collections/3d-printing-stl-file-collections",
  acrylic: "/collections/acrylic-stands-and-board-collections",
  tools: "/collections/art-and-craft-tools",
  beads: "/collections/clay-dangle-bead-roller-collections",
  stamps: "/collections/devin-symbol-stamps",
  shop: "/shop",
  home: "/",
};

const CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}$/;

export const INSTAGRAM_UTM = {
  utm_source: "instagram",
  utm_medium: "dm",
} as const;

/** Normalised code, or null when it is not a safe slug. */
export function normalizeInstagramShortCode(rawCode: string): string | null {
  const code = rawCode.trim().toLowerCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** Absolute redirect URL (with UTM tags) for a short code. */
export function buildInstagramShortLinkTarget(
  rawCode: string,
  origin: string,
): URL {
  const code = normalizeInstagramShortCode(rawCode);
  const path = code
    ? (INSTAGRAM_SHORT_LINKS[code] ?? `/collections/${code}`)
    : "/shop";

  const target = new URL(path, origin);
  target.searchParams.set("utm_source", INSTAGRAM_UTM.utm_source);
  target.searchParams.set("utm_medium", INSTAGRAM_UTM.utm_medium);
  target.searchParams.set("utm_campaign", code ?? "unknown");
  return target;
}
