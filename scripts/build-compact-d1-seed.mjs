import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const products = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/_d1-products-seed.json"), "utf8"),
);
const collections = JSON.parse(
  fs.readFileSync(
    path.join(root, "scripts/_d1-collections-seed.json"),
    "utf8",
  ),
);

function esc(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function trunc(s, n = 280) {
  if (s == null) return null;
  const t = String(s);
  return t.length <= n ? t : t.slice(0, n);
}

const stmts = [];
stmts.push(
  "DELETE FROM products;",
  "DELETE FROM collections;",
  "DELETE FROM medias;",
  "DELETE FROM catalog_meta;",
);

const seen = new Set();
for (const c of collections) {
  if (c.featured_image_id && !seen.has(c.featured_image_id)) {
    seen.add(c.featured_image_id);
    stmts.push(
      `INSERT OR REPLACE INTO medias (id, key, alt) VALUES (${esc(c.featured_image_id)}, ${esc(c.featured_image_key || "")}, ${esc(trunc(c.featured_image_alt || "", 120))});`,
    );
  }
}
for (const p of products) {
  if (p.featured_image_id && !seen.has(p.featured_image_id)) {
    seen.add(p.featured_image_id);
    stmts.push(
      `INSERT OR REPLACE INTO medias (id, key, alt) VALUES (${esc(p.featured_image_id)}, ${esc(p.featured_image_key || "")}, ${esc(trunc(p.featured_image_alt || "", 120))});`,
    );
  }
}

for (const c of collections) {
  stmts.push(
    `INSERT OR REPLACE INTO collections (id, label, slug, title, description, sort_order, featured_image_id, featured_image_key, featured_image_alt) VALUES (${esc(c.id)}, ${esc(c.label)}, ${esc(c.slug)}, ${esc(c.title)}, ${esc(trunc(c.description))}, ${c.sort_order == null ? "NULL" : Number(c.sort_order)}, ${esc(c.featured_image_id)}, ${esc(c.featured_image_key)}, ${esc(trunc(c.featured_image_alt, 120))});`,
  );
}

for (const p of products) {
  const tags =
    typeof p.tags === "string" ? p.tags : JSON.stringify(p.tags ?? []);
  stmts.push(
    `INSERT OR REPLACE INTO products (id, name, slug, product_code, is_draft, description, featured, badge, rating, tags, price, discount_enabled, discount_percent, sold_as_pack, pack_size, stock, collection_id, featured_image_id, featured_image_key, featured_image_alt, is_digital, created_at, archived_at) VALUES (${esc(p.id)}, ${esc(p.name)}, ${esc(p.slug)}, ${esc(p.product_code)}, ${p.is_draft ? 1 : 0}, ${esc(trunc(p.description))}, ${p.featured ? 1 : 0}, ${esc(p.badge)}, ${esc(String(p.rating ?? "4"))}, ${esc(tags)}, ${esc(String(p.price ?? "0.00"))}, ${p.discount_enabled ? 1 : 0}, ${p.discount_percent == null ? "NULL" : Number(p.discount_percent)}, ${p.sold_as_pack ? 1 : 0}, ${p.pack_size == null ? "NULL" : Number(p.pack_size)}, ${p.stock == null ? 8 : Number(p.stock)}, ${esc(p.collection_id)}, ${esc(p.featured_image_id)}, ${esc(p.featured_image_key)}, ${esc(trunc(p.featured_image_alt, 120))}, ${p.is_digital ? 1 : 0}, ${esc(p.created_at)}, ${esc(p.archived_at)});`,
  );
}

stmts.push(
  `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('synced_at', ${esc(new Date().toISOString())});`,
  `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('product_count', '${products.length}');`,
  `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('collection_count', '${collections.length}');`,
  `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('seed_note', 'truncated-descriptions-initial');`,
);

const outDir = path.join(root, "scripts/_d1-mcp-groups");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const MAX = 28000;
let group = [];
let size = 0;
let gi = 0;
for (const s of stmts) {
  if (size + s.length > MAX && group.length) {
    fs.writeFileSync(
      path.join(outDir, `group-${String(gi).padStart(2, "0")}.sql`),
      group.join("\n"),
    );
    gi += 1;
    group = [];
    size = 0;
  }
  group.push(s);
  size += s.length + 1;
}
if (group.length) {
  fs.writeFileSync(
    path.join(outDir, `group-${String(gi).padStart(2, "0")}.sql`),
    group.join("\n"),
  );
  gi += 1;
}

console.log(
  JSON.stringify({
    groups: gi,
    stmts: stmts.length,
    products: products.length,
    collections: collections.length,
    medias: seen.size,
  }),
);
