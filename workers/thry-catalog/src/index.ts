/**
 * thry-catalog — D1 catalog mirror API (Supabase remains source of truth).
 *
 * POST /sync          Bearer CATALOG_SYNC_SECRET — upsert from Supabase, prune removed rows
 * cron (30 min)       same sync, so a failed admin-triggered sync self-heals
 * GET  /health        public
 * GET  /collections   slug? | all
 * GET  /products      slug | featured | q | sort | price_min/max | collection_id |
 *                     require_collection | limit | offset → { products, hasMore, gallery? }
 * GET  /meta          catalog_meta key/values
 */

export interface Env {
  DB: D1Database;
  CATALOG_SYNC_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

type D1Database = {
  prepare: (query: string) => D1PreparedStatement;
  batch: (statements: D1PreparedStatement[]) => Promise<unknown[]>;
  exec: (query: string) => Promise<unknown>;
};

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  run: () => Promise<{ success: boolean; meta?: { changes?: number } }>;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function unauthorized(): Response {
  return json({ error: "unauthorized" }, 401);
}

function requireSyncAuth(request: Request, env: Env): boolean {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(env.CATALOG_SYNC_SECRET) && token === env.CATALOG_SYNC_SECRET;
}

async function fetchSupabaseJson<T>(env: Env, path: string): Promise<T> {
  const url = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`supabase ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

type CollectionRow = {
  id: string;
  label: string;
  slug: string;
  title: string;
  description: string;
  order: number | null;
  featured_image_id: string | null;
  medias?: { key?: string; alt?: string } | null;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  product_code: string | null;
  is_draft: boolean | null;
  description: string | null;
  featured: boolean | null;
  badge: string | null;
  rating: number | string | null;
  tags: unknown;
  price: number | string | null;
  discount_enabled: boolean | null;
  discount_percent: number | null;
  sold_as_pack: boolean | null;
  pack_size: number | null;
  stock: number | null;
  collection_id: string | null;
  featured_image_id: string;
  is_digital: boolean | null;
  created_at: string | null;
  archived_at: string | null;
  medias?: { key?: string; alt?: string } | null;
};

type ProductMediaRow = {
  id: string;
  productId: string;
  mediaId: string;
  priority: number | null;
  medias?: { key?: string; alt?: string } | null;
};

/** SQLite expression matching storefront effective-price (ROUND to whole rupees for filters). */
const EFFECTIVE_PRICE_SQL = `CASE
  WHEN discount_enabled = 1 AND discount_percent BETWEEN 1 AND 99
  THEN ROUND(CAST(price AS REAL) * (1.0 - CAST(discount_percent AS REAL) / 100.0), 2)
  ELSE CAST(price AS REAL)
END`;

const EFFECTIVE_PRICE_ROUNDED_SQL = `ROUND(${EFFECTIVE_PRICE_SQL})`;

const SYNC_LEASE_MS = 120_000;
/** Reads 503 past this age so the storefront falls back to Supabase. */
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;
/** Refuse a sync that would drop more than half the mirrored products (unless forced). */
const MIN_PRODUCT_RATIO = 0.5;
const SHRINK_GUARD_MIN_EXISTING = 10;

class SyncRefusedError extends Error {}

async function ensureSchema(env: Env) {
  // D1 exec() accepts a single statement only — run separately.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS product_medias (
      id TEXT PRIMARY KEY NOT NULL,
      product_id TEXT NOT NULL,
      media_id TEXT NOT NULL,
      media_key TEXT,
      media_alt TEXT,
      priority INTEGER
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_product_medias_product ON product_medias(product_id)`,
  ).run();
  const cols = await env.DB.prepare("PRAGMA table_info(products)").all<{
    name: string;
  }>();
  if (!(cols.results ?? []).some((c) => c.name === "name_rank")) {
    await env.DB.prepare(
      "ALTER TABLE products ADD COLUMN name_rank INTEGER",
    ).run();
  }
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_products_name_rank ON products(name_rank)",
  ).run();
}

function setMeta(env: Env, key: string, value: string): D1PreparedStatement {
  return env.DB.prepare(
    "INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)",
  ).bind(key, value);
}

/** Token is "<expiryMs>:<uuid>"; SQLite CAST reads the numeric prefix. */
async function acquireSyncLease(env: Env): Promise<string | null> {
  const now = Date.now();
  const token = `${now + SYNC_LEASE_MS}:${crypto.randomUUID()}`;
  const res = await env.DB.prepare(
    `INSERT INTO catalog_meta (key, value) VALUES ('sync_lease', ?1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value
     WHERE CAST(catalog_meta.value AS INTEGER) < ?2`,
  )
    .bind(token, now)
    .run();
  return (res.meta?.changes ?? 0) > 0 ? token : null;
}

async function releaseSyncLease(env: Env, token: string) {
  await env.DB.prepare(
    "DELETE FROM catalog_meta WHERE key = 'sync_lease' AND value = ?",
  )
    .bind(token)
    .run();
}

function pruneMissing(
  env: Env,
  table: string,
  ids: string[],
): D1PreparedStatement {
  return env.DB.prepare(
    `DELETE FROM ${table} WHERE id NOT IN (SELECT value FROM json_each(?))`,
  ).bind(JSON.stringify(ids));
}

async function syncFromSupabase(env: Env, opts: { force: boolean }) {
  await ensureSchema(env);

  const collections = await fetchSupabaseJson<CollectionRow[]>(
    env,
    "collections?select=id,label,slug,title,description,order,featured_image_id,medias(key,alt)",
  );
  // order matches the storefront's Postgres name sort; index becomes name_rank.
  const products = await fetchSupabaseJson<ProductRow[]>(
    env,
    "products?select=id,name,slug,product_code,is_draft,description,featured,badge,rating,tags,price,discount_enabled,discount_percent,sold_as_pack,pack_size,stock,collection_id,featured_image_id,is_digital,created_at,archived_at,medias(key,alt)&archived_at=is.null&order=name.asc,id.asc",
  );
  const productMedias = await fetchSupabaseJson<ProductMediaRow[]>(
    env,
    "product_medias?select=id,productId,mediaId,priority,medias(key,alt)",
  );

  const existing = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM products) AS p, (SELECT COUNT(*) FROM collections) AS c",
  ).first<{ p: number; c: number }>();
  const existingProducts = Number(existing?.p ?? 0);
  const existingCollections = Number(existing?.c ?? 0);

  if (!Array.isArray(products) || products.length === 0) {
    throw new SyncRefusedError("Supabase returned 0 products");
  }
  if (!Array.isArray(collections)) {
    throw new SyncRefusedError("Supabase collections response invalid");
  }
  if (!opts.force) {
    if (
      existingProducts >= SHRINK_GUARD_MIN_EXISTING &&
      products.length < existingProducts * MIN_PRODUCT_RATIO
    ) {
      throw new SyncRefusedError(
        `product count would drop ${existingProducts} -> ${products.length}`,
      );
    }
    if (existingCollections > 0 && collections.length === 0) {
      throw new SyncRefusedError(
        `collection count would drop ${existingCollections} -> 0`,
      );
    }
  }

  const mediaStatements: D1PreparedStatement[] = [];
  const seenMedia = new Set<string>();

  const upsertMedia = (
    mid: string | null | undefined,
    key: string | undefined,
    alt: string | undefined,
  ) => {
    if (!mid || seenMedia.has(mid)) return;
    seenMedia.add(mid);
    mediaStatements.push(
      env.DB.prepare(
        "INSERT OR REPLACE INTO medias (id, key, alt) VALUES (?, ?, ?)",
      ).bind(mid, key ?? "", alt ?? ""),
    );
  };

  for (const c of collections) {
    upsertMedia(c.featured_image_id, c.medias?.key, c.medias?.alt);
  }
  for (const p of products) {
    upsertMedia(p.featured_image_id, p.medias?.key, p.medias?.alt);
  }
  for (const pm of productMedias) {
    upsertMedia(pm.mediaId, pm.medias?.key, pm.medias?.alt);
  }

  for (let i = 0; i < mediaStatements.length; i += 40) {
    await env.DB.batch(mediaStatements.slice(i, i + 40));
  }

  const collectionStatements = collections.map((c) =>
    env.DB.prepare(
      `INSERT OR REPLACE INTO collections
      (id, label, slug, title, description, sort_order, featured_image_id, featured_image_key, featured_image_alt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      c.id,
      c.label ?? "",
      c.slug ?? "",
      c.title ?? "",
      c.description ?? "",
      c.order,
      c.featured_image_id,
      c.medias?.key ?? null,
      c.medias?.alt ?? null,
    ),
  );
  for (let i = 0; i < collectionStatements.length; i += 40) {
    await env.DB.batch(collectionStatements.slice(i, i + 40));
  }

  const productStatements = products.map((p, nameRank) =>
    env.DB.prepare(
      `INSERT OR REPLACE INTO products
      (id, name, slug, product_code, is_draft, description, featured, badge, rating, tags,
       price, discount_enabled, discount_percent, sold_as_pack, pack_size, stock,
       collection_id, featured_image_id, featured_image_key, featured_image_alt,
       is_digital, created_at, archived_at, name_rank)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      p.id,
      p.name ?? "",
      p.slug ?? "",
      p.product_code,
      p.is_draft ? 1 : 0,
      p.description,
      p.featured ? 1 : 0,
      p.badge,
      String(p.rating ?? "4"),
      typeof p.tags === "string" ? p.tags : JSON.stringify(p.tags ?? []),
      String(p.price ?? "0.00"),
      p.discount_enabled ? 1 : 0,
      p.discount_percent,
      p.sold_as_pack ? 1 : 0,
      p.pack_size,
      p.stock ?? 8,
      p.collection_id,
      p.featured_image_id,
      p.medias?.key ?? null,
      p.medias?.alt ?? null,
      p.is_digital ? 1 : 0,
      p.created_at,
      p.archived_at,
      nameRank,
    ),
  );
  for (let i = 0; i < productStatements.length; i += 25) {
    await env.DB.batch(productStatements.slice(i, i + 25));
  }

  const galleryStatements = productMedias.map((pm) =>
    env.DB.prepare(
      `INSERT OR REPLACE INTO product_medias
      (id, product_id, media_id, media_key, media_alt, priority)
      VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      pm.id,
      pm.productId,
      pm.mediaId,
      pm.medias?.key ?? null,
      pm.medias?.alt ?? null,
      pm.priority,
    ),
  );
  for (let i = 0; i < galleryStatements.length; i += 40) {
    await env.DB.batch(galleryStatements.slice(i, i + 40));
  }

  // Prune only after upserts so readers never see an empty or half-filled mirror.
  await env.DB.batch([
    pruneMissing(
      env,
      "product_medias",
      productMedias.map((pm) => pm.id),
    ),
    pruneMissing(
      env,
      "products",
      products.map((p) => p.id),
    ),
    pruneMissing(
      env,
      "collections",
      collections.map((c) => c.id),
    ),
    pruneMissing(env, "medias", [...seenMedia]),
  ]);

  const syncedAt = new Date().toISOString();
  await env.DB.batch([
    setMeta(env, "synced_at", syncedAt),
    setMeta(env, "product_count", String(products.length)),
    setMeta(env, "collection_count", String(collections.length)),
    setMeta(env, "gallery_count", String(productMedias.length)),
    env.DB.prepare("DELETE FROM catalog_meta WHERE key LIKE 'worker_b64_%'"),
  ]);
  mirrorSyncedAt = { value: Date.parse(syncedAt), checkedAt: Date.now() };

  return {
    ok: true as const,
    syncedAt,
    products: products.length,
    collections: collections.length,
    medias: seenMedia.size,
    gallery: productMedias.length,
  };
}

type SyncSource = "admin" | "cron";

/**
 * Serialised sync. A request arriving mid-sync marks sync_pending and the
 * lease holder re-runs once, so admin edits made during a sync are not lost.
 */
async function runSync(env: Env, source: SyncSource, force = false) {
  const token = await acquireSyncLease(env);
  if (!token) {
    await setMeta(env, "sync_pending", source).run();
    return { ok: true as const, queued: true };
  }
  try {
    let result: Awaited<ReturnType<typeof syncFromSupabase>>;
    let rounds = 0;
    for (;;) {
      await env.DB.prepare(
        "DELETE FROM catalog_meta WHERE key = 'sync_pending'",
      ).run();
      result = await syncFromSupabase(env, { force });
      rounds += 1;
      const pending = await env.DB.prepare(
        "SELECT value FROM catalog_meta WHERE key = 'sync_pending'",
      ).first();
      if (!pending || rounds >= 2) break;
    }
    await env.DB.batch([
      setMeta(env, "last_sync_source", source),
      env.DB.prepare("DELETE FROM catalog_meta WHERE key = 'last_sync_error'"),
    ]);
    return { ...result, rounds };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setMeta(
      env,
      "last_sync_error",
      `${new Date().toISOString()} ${source}: ${message}`.slice(0, 500),
    )
      .run()
      .catch(() => undefined);
    throw error;
  } finally {
    await releaseSyncLease(env, token).catch(() => undefined);
  }
}

let mirrorSyncedAt: { value: number; checkedAt: number } | null = null;

async function mirrorAgeMs(env: Env): Promise<number> {
  const now = Date.now();
  if (!mirrorSyncedAt || now - mirrorSyncedAt.checkedAt > 60_000) {
    const row = await env.DB.prepare(
      "SELECT value FROM catalog_meta WHERE key = 'synced_at'",
    ).first<{ value: string }>();
    mirrorSyncedAt = {
      value: row ? Date.parse(row.value) : NaN,
      checkedAt: now,
    };
  }
  return Number.isFinite(mirrorSyncedAt.value)
    ? now - mirrorSyncedAt.value
    : Number.POSITIVE_INFINITY;
}

function resolveSort(sort: string | null): string {
  switch ((sort || "").toLowerCase()) {
    case "name_asc":
      // name_rank is Supabase's own name order; LOWER() covers rows synced before it existed.
      return "name_rank ASC NULLS LAST, LOWER(name) ASC";
    case "price_asc":
      return `${EFFECTIVE_PRICE_SQL} ASC`;
    case "price_desc":
      return `${EFFECTIVE_PRICE_SQL} DESC`;
    case "featured":
      return "featured DESC, created_at DESC";
    case "newest":
    default:
      return "created_at DESC";
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (path === "/health" && request.method === "GET") {
        const meta = await env.DB.prepare(
          "SELECT key, value FROM catalog_meta",
        ).all<{ key: string; value: string }>();
        const map = Object.fromEntries(
          (meta.results ?? []).map((r) => [r.key, r.value]),
        );
        return json({ ok: true, meta: map });
      }

      if (path === "/sync" && request.method === "POST") {
        if (!requireSyncAuth(request, env)) return unauthorized();
        try {
          const result = await runSync(
            env,
            "admin",
            url.searchParams.get("force") === "1",
          );
          return json(result);
        } catch (error) {
          if (error instanceof SyncRefusedError) {
            return json({ ok: false, refused: error.message }, 409);
          }
          throw error;
        }
      }

      if (
        (path === "/collections" || path === "/products") &&
        request.method === "GET"
      ) {
        const age = await mirrorAgeMs(env);
        if (age > STALE_AFTER_MS) {
          return json({ error: "stale_mirror", ageMs: age }, 503);
        }
      }

      if (path === "/collections" && request.method === "GET") {
        const slug = url.searchParams.get("slug");
        if (slug) {
          const row = await env.DB.prepare(
            "SELECT * FROM collections WHERE slug = ? LIMIT 1",
          )
            .bind(slug)
            .first();
          return json({ collection: row });
        }
        const rows = await env.DB.prepare(
          "SELECT * FROM collections ORDER BY sort_order DESC NULLS LAST, label ASC",
        ).all();
        return json({ collections: rows.results ?? [] });
      }

      if (path === "/products" && request.method === "GET") {
        const slug = url.searchParams.get("slug");
        if (slug) {
          const row = await env.DB.prepare(
            "SELECT * FROM products WHERE slug = ? AND is_draft = 0 AND archived_at IS NULL LIMIT 1",
          )
            .bind(slug)
            .first();
          if (!row) {
            return json({ product: null, gallery: [] });
          }
          let gallery: unknown[] = [];
          try {
            const galleryRows = await env.DB.prepare(
              `SELECT media_id AS id, media_key AS key, media_alt AS alt, priority
               FROM product_medias WHERE product_id = ?
               ORDER BY priority DESC NULLS LAST`,
            )
              .bind((row as { id: string }).id)
              .all();
            gallery = galleryRows.results ?? [];
          } catch {
            gallery = [];
          }
          return json({ product: row, gallery });
        }

        const featured = url.searchParams.get("featured") === "1";
        const collectionId = url.searchParams.get("collection_id");
        const requireCollection =
          url.searchParams.get("require_collection") === "1";
        const qRaw = (url.searchParams.get("q") || "").trim();
        const sort = url.searchParams.get("sort");
        const priceMinRaw = url.searchParams.get("price_min");
        const priceMaxRaw = url.searchParams.get("price_max");
        const priceMin = priceMinRaw != null ? Number(priceMinRaw) : NaN;
        const priceMax = priceMaxRaw != null ? Number(priceMaxRaw) : NaN;
        const limit = Math.min(
          Number(url.searchParams.get("limit") || "24") || 24,
          100,
        );
        const offset = Math.max(
          Number(url.searchParams.get("offset") || "0") || 0,
          0,
        );

        let query =
          "SELECT * FROM products WHERE is_draft = 0 AND archived_at IS NULL";
        const binds: unknown[] = [];

        if (featured) query += " AND featured = 1";
        if (collectionId) {
          query += " AND collection_id = ?";
          binds.push(collectionId);
        }
        if (requireCollection) {
          query += " AND collection_id IS NOT NULL";
        }
        if (qRaw) {
          query +=
            " AND (name LIKE ? OR slug LIKE ? OR IFNULL(description, '') LIKE ?)";
          const like = `%${qRaw}%`;
          binds.push(like, like, like);
        }
        if (Number.isFinite(priceMin) && Number.isFinite(priceMax)) {
          query += ` AND ${EFFECTIVE_PRICE_ROUNDED_SQL} >= ? AND ${EFFECTIVE_PRICE_ROUNDED_SQL} <= ?`;
          binds.push(priceMin, priceMax);
        }

        query += ` ORDER BY ${resolveSort(sort)} LIMIT ? OFFSET ?`;
        binds.push(limit + 1, offset);

        let stmt = env.DB.prepare(query);
        if (binds.length) stmt = stmt.bind(...binds);
        const rows = await stmt.all();
        const results = rows.results ?? [];
        const hasMore = results.length > limit;
        const products = hasMore ? results.slice(0, limit) : results;
        return json({ products, hasMore });
      }

      if (path === "/meta" && request.method === "GET") {
        const meta = await env.DB.prepare(
          "SELECT key, value FROM catalog_meta",
        ).all<{ key: string; value: string }>();
        return json({
          meta: Object.fromEntries(
            (meta.results ?? []).map((r) => [r.key, r.value]),
          ),
        });
      }

      return json({ error: "not_found" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, 500);
    }
  },

  async scheduled(
    _event: unknown,
    env: Env,
    ctx: { waitUntil: (promise: Promise<unknown>) => void },
  ): Promise<void> {
    ctx.waitUntil(
      runSync(env, "cron").catch((error) => {
        console.error("[thry-catalog] cron sync failed:", error);
      }),
    );
  },
};
