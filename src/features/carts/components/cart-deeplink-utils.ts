import { buildCartLineKey } from "../cart-line";

export type CartDeepLinkLine = { productId: string; quantity: number };

const MAX_QTY = 99;

export function parseQuantity(raw: string | null): number {
  const n = parseInt(raw || "1", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_QTY) : 1;
}

/** Parse `items=id1:2,id2:1` from Velo multi-cart share links. */
export function parseCartItemsParam(raw: string | null): CartDeepLinkLine[] {
  if (!raw?.trim()) return [];
  const out: CartDeepLinkLine[] = [];
  for (const part of raw.split(",")) {
    const segment = part.trim();
    if (!segment) continue;
    const colon = segment.lastIndexOf(":");
    const productId =
      colon > 0 ? segment.slice(0, colon).trim() : segment.trim();
    const qty = colon > 0 ? parseQuantity(segment.slice(colon + 1)) : 1;
    if (productId) out.push({ productId, quantity: qty });
  }
  return mergeDeepLinkLines(out);
}

/** Merge duplicate product IDs in one deep link (sum quantities, cap at 99). */
export function mergeDeepLinkLines(
  lines: CartDeepLinkLine[],
): CartDeepLinkLine[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    const id = line.productId.trim();
    if (!id) continue;
    const next = (merged.get(id) ?? 0) + line.quantity;
    merged.set(id, Math.min(next, MAX_QTY));
  }
  return Array.from(merged.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

export function linesFingerprint(lines: CartDeepLinkLine[]): string {
  return mergeDeepLinkLines(lines)
    .map((l) => `${l.productId}:${l.quantity}`)
    .sort()
    .join("|");
}

export function parseDeepLinkLines(
  searchParams: URLSearchParams,
): CartDeepLinkLine[] {
  const multi = parseCartItemsParam(searchParams.get("items"));
  if (multi.length > 0) return multi;

  const add = searchParams.get("add") ?? searchParams.get("productId");
  const productId = add?.trim() ?? "";
  if (!productId) return [];

  const quantity = parseQuantity(
    searchParams.get("quantity") ?? searchParams.get("qty"),
  );
  return [{ productId, quantity }];
}

/** Velo `items=` multi-share replaces cart; single `add=` sets one line only. */
export function isReplaceEntireCartDeepLink(searchParams: URLSearchParams) {
  return Boolean(searchParams.get("items")?.trim());
}

export function linesToCartItems(lines: CartDeepLinkLine[]) {
  // Deep links are product+qty only (default variant). Use line keys so they
  // do not collide with sized/coloured lines of the same product.
  return Object.fromEntries(
    lines.map((line) => {
      const lineKey = buildCartLineKey({ productId: line.productId });
      return [
        lineKey,
        {
          productId: line.productId,
          quantity: line.quantity,
        },
      ];
    }),
  );
}

const DEEPLINK_STORAGE_PREFIX = "velo_cart_deeplink_v1:";
const DEEPLINK_INFLIGHT_PREFIX = "velo_cart_deeplink_inflight_v1:";
export const DEEPLINK_TTL_MS = 10 * 60 * 1000;

export function wasDeepLinkProcessed(fingerprint: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(DEEPLINK_STORAGE_PREFIX + fingerprint);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DEEPLINK_TTL_MS;
  } catch {
    return false;
  }
}

/** Atomic claim: returns false if already processed or another tab is applying the same link. */
export function claimDeepLink(fingerprint: string): boolean {
  if (typeof window === "undefined") return false;
  if (wasDeepLinkProcessed(fingerprint)) return false;
  try {
    const inflightKey = DEEPLINK_INFLIGHT_PREFIX + fingerprint;
    if (sessionStorage.getItem(inflightKey)) return false;
    sessionStorage.setItem(inflightKey, String(Date.now()));
    sessionStorage.setItem(
      DEEPLINK_STORAGE_PREFIX + fingerprint,
      String(Date.now()),
    );
    return true;
  } catch {
    return true;
  }
}

export function releaseDeepLinkInflight(fingerprint: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(DEEPLINK_INFLIGHT_PREFIX + fingerprint);
  } catch {
    /* ignore */
  }
}
