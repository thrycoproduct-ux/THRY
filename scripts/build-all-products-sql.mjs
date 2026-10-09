/**
 * Applies all mini D1 seed batches via Cloudflare MCP-compatible SQL files.
 * This script prints a single combined SQL for local wrangler when token exists:
 *   npx wrangler d1 execute thry-catalog --remote --file=scripts/_d1-all-products.sql --config workers/thry-catalog/wrangler.jsonc
 */
import fs from "node:fs";

const products = JSON.parse(
  fs.readFileSync("scripts/_d1-products-compact.json", "utf8"),
);

function esc(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

const stmts = [];
for (const p of products) {
  stmts.push(
    `INSERT OR REPLACE INTO medias (id, key, alt) VALUES (${esc(p.featured_image_id)}, ${esc(p.featured_image_key || "")}, ${esc(p.featured_image_alt || "")});`,
  );
  stmts.push(
    `INSERT OR REPLACE INTO products (id, name, slug, product_code, is_draft, description, featured, badge, rating, tags, price, discount_enabled, discount_percent, sold_as_pack, pack_size, stock, collection_id, featured_image_id, featured_image_key, featured_image_alt, is_digital, created_at, archived_at) VALUES (${esc(p.id)}, ${esc(p.name)}, ${esc(p.slug)}, ${esc(p.product_code)}, ${p.is_draft}, ${esc("")}, ${p.featured}, ${esc(p.badge)}, ${esc(p.rating)}, ${esc("[]")}, ${esc(p.price)}, ${p.discount_enabled}, ${p.discount_percent == null ? "NULL" : Number(p.discount_percent)}, ${p.sold_as_pack}, ${p.pack_size == null ? "NULL" : Number(p.pack_size)}, ${Number(p.stock)}, ${esc(p.collection_id)}, ${esc(p.featured_image_id)}, ${esc(p.featured_image_key)}, ${esc(p.featured_image_alt)}, ${p.is_digital}, ${esc(p.created_at)}, ${esc(p.archived_at)});`,
  );
}
stmts.push(
  `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('synced_at', ${esc(new Date().toISOString())});`,
  `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('product_count', '${products.length}');`,
  `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('collection_count', '16');`,
  `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('seed_note', 'full-compact');`,
);
fs.writeFileSync("scripts/_d1-all-products.sql", stmts.join("\n"));
console.log("wrote scripts/_d1-all-products.sql", stmts.length, "statements");
