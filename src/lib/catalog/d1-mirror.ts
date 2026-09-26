/**
 * Catalog D1 mirror client + sync trigger.
 * Default CATALOG_READ=supabase — production stays on Supabase/Redis until flipped.
 */

export type CatalogReadSource = "supabase" | "d1";

export function getCatalogReadSource(): CatalogReadSource {
  const raw = (process.env.CATALOG_READ || "supabase").trim().toLowerCase();
  return raw === "d1" ? "d1" : "supabase";
}

export function isCatalogD1Enabled(): boolean {
  return getCatalogReadSource() === "d1";
}

function catalogWorkerBaseUrl(): string | null {
  const url = (process.env.CATALOG_WORKER_URL || "").trim().replace(/\/+$/, "");
  return url || null;
}

function catalogSyncSecret(): string | null {
  const secret = (process.env.CATALOG_SYNC_SECRET || "").trim();
  return secret || null;
}

export type CatalogSyncResult =
  | { ok: true; skipped?: string; data?: unknown }
  | { ok: false; error: string };

/**
 * Best-effort Supabase→D1 sync via thry-catalog Worker.
 * Never throws — catalog writes must not fail if mirror is down.
 */
export async function syncCatalogMirror(): Promise<CatalogSyncResult> {
  const base = catalogWorkerBaseUrl();
  const secret = catalogSyncSecret();
  if (!base || !secret) {
    return {
      ok: true,
      skipped: "missing CATALOG_WORKER_URL or CATALOG_SYNC_SECRET",
    };
  }

  try {
    const res = await fetch(`${base}/sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
      // Admin writes should not hang on mirror lag
      signal: AbortSignal.timeout(25_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: `catalog sync HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`,
      };
    }
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

/** Fire-and-forget wrapper for invalidate paths. */
export function triggerCatalogMirrorSync(): void {
  void syncCatalogMirror().then((result) => {
    if (result.ok === false) {
      console.warn("[catalog-d1] sync failed:", result.error);
      return;
    }
    if (result.skipped) {
      // Quiet skip when not configured yet
      return;
    }
    console.info("[catalog-d1] sync ok:", result.data);
  });
}

export type D1ProductRow = {
  id: string;
  name: string;
  slug: string;
  product_code: string | null;
  is_draft: number;
  description: string | null;
  featured: number | null;
  badge: string | null;
  rating: string;
  tags: string;
  price: string;
  discount_enabled: number;
  discount_percent: number | null;
  sold_as_pack: number;
  pack_size: number | null;
  stock: number | null;
  collection_id: string | null;
  featured_image_id: string;
  featured_image_key: string | null;
  featured_image_alt: string | null;
  is_digital: number;
  created_at: string | null;
  archived_at: string | null;
};

export type D1CollectionRow = {
  id: string;
  label: string;
  slug: string;
  title: string;
  description: string;
  sort_order: number | null;
  featured_image_id: string | null;
  featured_image_key: string | null;
  featured_image_alt: string | null;
};

async function catalogGet<T>(path: string): Promise<T> {
  const base = catalogWorkerBaseUrl();
  if (!base) {
    throw new Error("CATALOG_WORKER_URL is not set");
  }
  const res = await fetch(`${base}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`catalog worker ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchD1Collections(): Promise<D1CollectionRow[]> {
  const data = await catalogGet<{ collections: D1CollectionRow[] }>(
    "/collections",
  );
  return data.collections ?? [];
}

export async function fetchD1CollectionBySlug(
  slug: string,
): Promise<D1CollectionRow | null> {
  const data = await catalogGet<{ collection: D1CollectionRow | null }>(
    `/collections?slug=${encodeURIComponent(slug)}`,
  );
  return data.collection ?? null;
}

export async function fetchD1ProductBySlug(
  slug: string,
): Promise<D1ProductRow | null> {
  const data = await catalogGet<{ product: D1ProductRow | null }>(
    `/products?slug=${encodeURIComponent(slug)}`,
  );
  return data.product ?? null;
}

export async function fetchD1FeaturedProducts(
  limit = 12,
): Promise<D1ProductRow[]> {
  const data = await catalogGet<{ products: D1ProductRow[] }>(
    `/products?featured=1&limit=${limit}`,
  );
  return data.products ?? [];
}

export async function fetchD1CatalogHealth(): Promise<{
  ok: boolean;
  meta: Record<string, string>;
}> {
  return catalogGet("/health");
}
