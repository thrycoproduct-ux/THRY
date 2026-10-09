import fs from "node:fs";
import path from "node:path";

const products = JSON.parse(
  fs.readFileSync("scripts/_d1-products-seed.json", "utf8"),
);
const collections = JSON.parse(
  fs.readFileSync("scripts/_d1-collections-seed.json", "utf8"),
);
const dbId = "85283c0d-4c77-4187-8d68-ff166a1a6d50";
const out = "scripts/_d1-mcp-apply";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

function esc(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function writeApply(name, sql) {
  const code = `async () => {
  const dbId = ${JSON.stringify(dbId)};
  const sql = ${JSON.stringify(sql)};
  const res = await cloudflare.request({
    method: "POST",
    path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query",
    body: { sql },
  });
  return { file: ${JSON.stringify(name)}, success: res.success, status: res.status, errors: res.errors };
}`;
  fs.writeFileSync(path.join(out, `${name}.js`), code);
}

// 0: reset + all collections + medias for collections
{
  const stmts = [
    "DELETE FROM products",
    "DELETE FROM collections",
    "DELETE FROM medias",
    "DELETE FROM catalog_meta",
  ];
  const seen = new Set();
  for (const c of collections) {
    if (c.featured_image_id && !seen.has(c.featured_image_id)) {
      seen.add(c.featured_image_id);
      stmts.push(
        `INSERT OR REPLACE INTO medias (id, key, alt) VALUES (${esc(c.featured_image_id)}, ${esc(c.featured_image_key || "")}, ${esc((c.featured_image_alt || "").slice(0, 60))})`,
      );
    }
    stmts.push(
      `INSERT OR REPLACE INTO collections (id, label, slug, title, description, sort_order, featured_image_id, featured_image_key, featured_image_alt) VALUES (${esc(c.id)}, ${esc(c.label)}, ${esc(c.slug)}, ${esc(c.title)}, ${esc((c.description || "").slice(0, 100))}, ${c.sort_order == null ? "NULL" : Number(c.sort_order)}, ${esc(c.featured_image_id)}, ${esc(c.featured_image_key)}, ${esc((c.featured_image_alt || "").slice(0, 60))})`,
    );
  }
  writeApply("00-collections", stmts.join(";\n") + ";");
}

// product batches of 12
const BATCH = 12;
let bi = 0;
for (let i = 0; i < products.length; i += BATCH) {
  const chunk = products.slice(i, i + BATCH);
  const stmts = [];
  const seen = new Set();
  for (const p of chunk) {
    if (p.featured_image_id && !seen.has(p.featured_image_id)) {
      seen.add(p.featured_image_id);
      stmts.push(
        `INSERT OR REPLACE INTO medias (id, key, alt) VALUES (${esc(p.featured_image_id)}, ${esc(p.featured_image_key || "")}, ${esc((p.featured_image_alt || "").slice(0, 60))})`,
      );
    }
    stmts.push(
      `INSERT OR REPLACE INTO products (id, name, slug, product_code, is_draft, description, featured, badge, rating, tags, price, discount_enabled, discount_percent, sold_as_pack, pack_size, stock, collection_id, featured_image_id, featured_image_key, featured_image_alt, is_digital, created_at, archived_at) VALUES (${esc(p.id)}, ${esc(p.name)}, ${esc(p.slug)}, ${esc(p.product_code)}, ${p.is_draft ? 1 : 0}, '', ${p.featured ? 1 : 0}, ${esc(p.badge)}, ${esc(String(p.rating ?? "4"))}, '[]', ${esc(String(p.price ?? "0.00"))}, ${p.discount_enabled ? 1 : 0}, ${p.discount_percent == null ? "NULL" : Number(p.discount_percent)}, ${p.sold_as_pack ? 1 : 0}, ${p.pack_size == null ? "NULL" : Number(p.pack_size)}, ${p.stock == null ? 8 : Number(p.stock)}, ${esc(p.collection_id)}, ${esc(p.featured_image_id)}, ${esc(p.featured_image_key)}, ${esc((p.featured_image_alt || "").slice(0, 60))}, ${p.is_digital ? 1 : 0}, ${esc(p.created_at)}, ${esc(p.archived_at)})`,
    );
  }
  writeApply(`p-${String(bi).padStart(2, "0")}`, stmts.join(";\n") + ";");
  bi += 1;
}

writeApply(
  "zz-meta",
  `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('synced_at', ${esc(new Date().toISOString())});
INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('product_count', '${products.length}');
INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('collection_count', '${collections.length}');
INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('seed_note', 'batched-no-desc');`,
);

const files = fs.readdirSync(out).filter((f) => f.endsWith(".js")).sort();
console.log(
  JSON.stringify({
    files: files.length,
    sizes: files.map((f) => [f, fs.statSync(path.join(out, f)).size]),
  }),
);
