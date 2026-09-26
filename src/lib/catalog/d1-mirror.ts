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

export type D1GalleryImage = {
  id: string;
  key: string | null;
  alt: string | null;
  priority?: number | null;
};

export type D1ProductSearchParams = {
  q?: string | null;
  sort?: "newest" | "name_asc" | "price_asc" | "price_desc" | "featured";
  priceMin?: number | null;
  priceMax?: number | null;
  collectionId?: string | null;
  requireCollection?: boolean;
  featured?: boolean;
  limit: number;
  offset: number;
};

export type D1ProductSearchResult = {
  products: D1ProductRow[];
  hasMore: boolean;
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
): Promise<{ product: D1ProductRow | null; gallery: D1GalleryImage[] }> {
  const data = await catalogGet<{
    product: D1ProductRow | null;
    gallery?: D1GalleryImage[];
  }>(`/products?slug=${encodeURIComponent(slug)}`);
  return {
    product: data.product ?? null,
    gallery: data.gallery ?? [],
  };
}

export async function fetchD1FeaturedProducts(
  limit = 12,
): Promise<D1ProductRow[]> {
  const data = await catalogGet<{ products: D1ProductRow[]; hasMore?: boolean }>(
    `/products?featured=1&limit=${limit}`,
  );
  return data.products ?? [];
}

export async function fetchD1ProductSearch(
  params: D1ProductSearchParams,
): Promise<D1ProductSearchResult> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit));
  qs.set("offset", String(params.offset));
  if (params.q) qs.set("q", params.q);
  if (params.sort) qs.set("sort", params.sort);
  if (params.collectionId) qs.set("collection_id", params.collectionId);
  if (params.requireCollection) qs.set("require_collection", "1");
  if (params.featured) qs.set("featured", "1");
  if (
    params.priceMin != null &&
    params.priceMax != null &&
    Number.isFinite(params.priceMin) &&
    Number.isFinite(params.priceMax)
  ) {
    qs.set("price_min", String(params.priceMin));
    qs.set("price_max", String(params.priceMax));
  }
  const data = await catalogGet<{
    products: D1ProductRow[];
    hasMore?: boolean;
  }>(`/products?${qs.toString()}`);
  return {
    products: data.products ?? [],
    hasMore: Boolean(data.hasMore),
  };
}

export async function fetchD1CatalogHealth(): Promise<{
  ok: boolean;
  meta: Record<string, string>;
}> {
  return catalogGet("/health");
}

/** Map storefront orderBy / sort into Worker sort keys. */
export function mapStorefrontOrderByToD1Sort(
  orderBy: unknown,
): D1ProductSearchParams["sort"] {
  const rules = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  const asRecord = rules as Array<Record<string, string | undefined>>;
  if (
    asRecord.some((o) => "featured" in o) &&
    asRecord.some((o) => "created_at" in o)
  ) {
    return "featured";
  }
  if (asRecord.some((o) => "price" in o && String(o.price).includes("Asc"))) {
    return "price_asc";
  }
  if (asRecord.some((o) => "price" in o && String(o.price).includes("Desc"))) {
    return "price_desc";
  }
  if (asRecord.some((o) => "name" in o)) {
    return "name_asc";
  }
  if (asRecord.some((o) => "created_at" in o)) {
    return "newest";
  }
  return "newest";
}
