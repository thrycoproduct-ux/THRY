import fs from "node:fs";
import path from "node:path";

const products = JSON.parse(
  fs.readFileSync("scripts/_d1-products-seed.json", "utf8"),
);
const dbId = "85283c0d-4c77-4187-8d68-ff166a1a6d50";
const out = "scripts/_d1-mcp-apply";
fs.mkdirSync(out, { recursive: true });

const BATCH = 15;
let bi = 0;
for (let i = 0; i < products.length; i += BATCH) {
  const chunk = products.slice(i, i + BATCH).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    product_code: p.product_code,
    is_draft: p.is_draft ? 1 : 0,
    featured: p.featured ? 1 : 0,
    badge: p.badge,
    rating: String(p.rating ?? "4"),
    price: String(p.price ?? "0.00"),
    discount_enabled: p.discount_enabled ? 1 : 0,
    discount_percent: p.discount_percent,
    sold_as_pack: p.sold_as_pack ? 1 : 0,
    pack_size: p.pack_size,
    stock: p.stock ?? 8,
    collection_id: p.collection_id,
    featured_image_id: p.featured_image_id,
    featured_image_key: p.featured_image_key,
    featured_image_alt: (p.featured_image_alt || "").slice(0, 40),
    is_digital: p.is_digital ? 1 : 0,
    created_at: p.created_at,
    archived_at: p.archived_at,
  }));

  const code = `async () => {
  const dbId = ${JSON.stringify(dbId)};
  const products = ${JSON.stringify(chunk)};
  function esc(v) {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  }
  const stmts = [];
  const seen = new Set();
  for (const p of products) {
    if (p.featured_image_id && !seen.has(p.featured_image_id)) {
      seen.add(p.featured_image_id);
      stmts.push("INSERT OR REPLACE INTO medias (id, key, alt) VALUES (" + esc(p.featured_image_id) + ", " + esc(p.featured_image_key || "") + ", " + esc(p.featured_image_alt || "") + ")");
    }
    stmts.push("INSERT OR REPLACE INTO products (id, name, slug, product_code, is_draft, description, featured, badge, rating, tags, price, discount_enabled, discount_percent, sold_as_pack, pack_size, stock, collection_id, featured_image_id, featured_image_key, featured_image_alt, is_digital, created_at, archived_at) VALUES (" + [
      esc(p.id), esc(p.name), esc(p.slug), esc(p.product_code), p.is_draft, "''", p.featured, esc(p.badge), esc(p.rating), "'[]'", esc(p.price),
      p.discount_enabled, p.discount_percent == null ? "NULL" : Number(p.discount_percent),
      p.sold_as_pack, p.pack_size == null ? "NULL" : Number(p.pack_size), Number(p.stock),
      esc(p.collection_id), esc(p.featured_image_id), esc(p.featured_image_key), esc(p.featured_image_alt),
      p.is_digital, esc(p.created_at), esc(p.archived_at)
    ].join(", ") + ")");
  }
  const sql = stmts.join(";\\n") + ";";
  const res = await cloudflare.request({
    method: "POST",
    path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query",
    body: { sql },
  });
  return { batch: ${bi}, count: products.length, success: res.success, status: res.status, errors: res.errors };
}`;

  const name = `json-p-${String(bi).padStart(2, "0")}.js`;
  fs.writeFileSync(path.join(out, name), code);
  console.log(name, code.length);
  bi += 1;
}

const meta = `async () => {
  const dbId = ${JSON.stringify(dbId)};
  const sql = "INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('synced_at', '${new Date().toISOString()}'); INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('product_count', '${products.length}'); INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('collection_count', '16'); INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('seed_note', 'json-batches');";
  const res = await cloudflare.request({ method: "POST", path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query", body: { sql } });
  const counts = await cloudflare.request({ method: "POST", path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query", body: { sql: "SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM collections) AS collections, (SELECT COUNT(*) FROM medias) AS medias;" } });
  return { success: res.success, errors: res.errors, counts: counts.result };
}`;
fs.writeFileSync(path.join(out, "json-zz-meta.js"), meta);
console.log("batches", bi);
