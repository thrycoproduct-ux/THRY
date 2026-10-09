import fs from "node:fs";
import path from "node:path";

const products = JSON.parse(
  fs.readFileSync("scripts/_d1-products-seed.json", "utf8"),
);
const collections = JSON.parse(
  fs.readFileSync("scripts/_d1-collections-seed.json", "utf8"),
);

function esc(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

const stmts = [
  "DELETE FROM products",
  "DELETE FROM collections",
  "DELETE FROM medias",
  "DELETE FROM catalog_meta",
];

const seen = new Set();
for (const row of [...collections, ...products]) {
  const mid = row.featured_image_id;
  if (mid && !seen.has(mid)) {
    seen.add(mid);
    stmts.push(
      `INSERT OR REPLACE INTO medias (id, key, alt) VALUES (${esc(mid)}, ${esc(row.featured_image_key || "")}, ${esc((row.featured_image_alt || "").slice(0, 80))})`,
    );
  }
}

for (const c of collections) {
  stmts.push(
    `INSERT OR REPLACE INTO collections (id, label, slug, title, description, sort_order, featured_image_id, featured_image_key, featured_image_alt) VALUES (${esc(c.id)}, ${esc(c.label)}, ${esc(c.slug)}, ${esc(c.title)}, ${esc((c.description || "").slice(0, 120))}, ${c.sort_order == null ? "NULL" : Number(c.sort_order)}, ${esc(c.featured_image_id)}, ${esc(c.featured_image_key)}, ${esc((c.featured_image_alt || "").slice(0, 80))})`,
  );
}

for (const p of products) {
  stmts.push(
    `INSERT OR REPLACE INTO products (id, name, slug, product_code, is_draft, description, featured, badge, rating, tags, price, discount_enabled, discount_percent, sold_as_pack, pack_size, stock, collection_id, featured_image_id, featured_image_key, featured_image_alt, is_digital, created_at, archived_at) VALUES (${esc(p.id)}, ${esc(p.name)}, ${esc(p.slug)}, ${esc(p.product_code)}, ${p.is_draft ? 1 : 0}, '', ${p.featured ? 1 : 0}, ${esc(p.badge)}, ${esc(String(p.rating ?? "4"))}, '[]', ${esc(String(p.price ?? "0.00"))}, ${p.discount_enabled ? 1 : 0}, ${p.discount_percent == null ? "NULL" : Number(p.discount_percent)}, ${p.sold_as_pack ? 1 : 0}, ${p.pack_size == null ? "NULL" : Number(p.pack_size)}, ${p.stock == null ? 8 : Number(p.stock)}, ${esc(p.collection_id)}, ${esc(p.featured_image_id)}, ${esc(p.featured_image_key)}, ${esc((p.featured_image_alt || "").slice(0, 80))}, ${p.is_digital ? 1 : 0}, ${esc(p.created_at)}, ${esc(p.archived_at)})`,
  );
}

stmts.push(
  `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('synced_at', ${esc(new Date().toISOString())})`,
  `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('product_count', '${products.length}')`,
  `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('collection_count', '${collections.length}')`,
  `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('seed_note', 'no-descriptions-initial')`,
);

const dbId = "85283c0d-4c77-4187-8d68-ff166a1a6d50";
const out = "scripts/_d1-mcp-apply";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const MAX = 12000;
let group = [];
let size = 0;
let gi = 0;
const flush = () => {
  if (!group.length) return;
  const sql = group.join(";\n") + ";";
  const code = `async () => {
  const dbId = ${JSON.stringify(dbId)};
  const sql = ${JSON.stringify(sql)};
  const res = await cloudflare.request({
    method: "POST",
    path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query",
    body: { sql },
  });
  return { file: "group-${String(gi).padStart(2, "0")}", success: res.success, status: res.status, errors: res.errors, resultCount: Array.isArray(res.result) ? res.result.length : 0 };
}`;
  fs.writeFileSync(path.join(out, `group-${String(gi).padStart(2, "0")}.js`), code);
  gi += 1;
  group = [];
  size = 0;
};

for (const s of stmts) {
  if (size + s.length > MAX && group.length) flush();
  group.push(s);
  size += s.length + 2;
}
flush();
console.log(JSON.stringify({ groups: gi, stmts: stmts.length }));
