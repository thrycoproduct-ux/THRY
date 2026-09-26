/**
 * thry-catalog — D1 catalog mirror API (Supabase remains source of truth).
 *
 * POST /sync          Bearer CATALOG_SYNC_SECRET — full replace from Supabase
 * GET  /health        public
 * GET  /collections   Bearer or public read of mirrored collections
 * GET  /products      query: slug | featured=1 | collection_id | limit | offset
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
  run: () => Promise<{ success: boolean; meta?: unknown }>;
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

async function syncFromSupabase(env: Env) {
  const collections = await fetchSupabaseJson<CollectionRow[]>(
    env,
    "collections?select=id,label,slug,title,description,order,featured_image_id,medias(key,alt)",
  );
  const products = await fetchSupabaseJson<ProductRow[]>(
    env,
    "products?select=id,name,slug,product_code,is_draft,description,featured,badge,rating,tags,price,discount_enabled,discount_percent,sold_as_pack,pack_size,stock,collection_id,featured_image_id,is_digital,created_at,archived_at,medias(key,alt)&archived_at=is.null",
  );

  await env.DB.batch([
    env.DB.prepare("DELETE FROM products"),
    env.DB.prepare("DELETE FROM collections"),
    env.DB.prepare("DELETE FROM medias"),
  ]);

  const mediaStatements: D1PreparedStatement[] = [];
  const seenMedia = new Set<string>();

  for (const c of collections) {
    const mid = c.featured_image_id;
    if (mid && !seenMedia.has(mid)) {
      seenMedia.add(mid);
      mediaStatements.push(
        env.DB.prepare(
          "INSERT OR REPLACE INTO medias (id, key, alt) VALUES (?, ?, ?)",
        ).bind(mid, c.medias?.key ?? "", c.medias?.alt ?? ""),
      );
    }
  }
  for (const p of products) {
    const mid = p.featured_image_id;
    if (mid && !seenMedia.has(mid)) {
      seenMedia.add(mid);
      mediaStatements.push(
        env.DB.prepare(
          "INSERT OR REPLACE INTO medias (id, key, alt) VALUES (?, ?, ?)",
        ).bind(mid, p.medias?.key ?? "", p.medias?.alt ?? ""),
      );
    }
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

  const productStatements = products.map((p) =>
    env.DB.prepare(
      `INSERT OR REPLACE INTO products
      (id, name, slug, product_code, is_draft, description, featured, badge, rating, tags,
       price, discount_enabled, discount_percent, sold_as_pack, pack_size, stock,
       collection_id, featured_image_id, featured_image_key, featured_image_alt,
       is_digital, created_at, archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ),
  );
  for (let i = 0; i < productStatements.length; i += 25) {
    await env.DB.batch(productStatements.slice(i, i + 25));
  }

  const syncedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)",
    ).bind("synced_at", syncedAt),
    env.DB.prepare(
      "INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)",
    ).bind("product_count", String(products.length)),
    env.DB.prepare(
      "INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)",
    ).bind("collection_count", String(collections.length)),
  ]);

  return {
    ok: true,
    syncedAt,
    products: products.length,
    collections: collections.length,
    medias: seenMedia.size,
  };
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
        const result = await syncFromSupabase(env);
        return json(result);
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
          return json({ product: row });
        }

        const featured = url.searchParams.get("featured") === "1";
        const collectionId = url.searchParams.get("collection_id");
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
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
        binds.push(limit, offset);

        let stmt = env.DB.prepare(query);
        if (binds.length) stmt = stmt.bind(...binds);
        const rows = await stmt.all();
        return json({ products: rows.results ?? [] });
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
};
