import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const products = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/_d1-products-seed.json"), "utf8"),
);

function esc(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

const collections = [
  {
    id: "thry_col_statues",
    label: "Resin art essentials",
    slug: "3d-printed-statues",
    title: "Resin art essentials",
    description: "Detailed 3d printed idols for resin art.",
    sort_order: 2,
    featured_image_id: "uaf43lto09irsjandl80vmld",
    featured_image_key: "uploads/upload-bat0Jc4NISjTbZoNSmUlQ.png",
    featured_image_alt: "img-4457.webp",
  },
  {
    id: "thry_col_craft",
    label: "Clay cutters collection",
    slug: "art-craft",
    title: "Clay cutters collection",
    description: "Detailed Clay cutters uniquely designed from Thry co",
    sort_order: 1,
    featured_image_id: "yni96e2xdvqprahutq1s25ql",
    featured_image_key: "uploads/upload-1U5INHtiDEdmha5BMrfaR.png",
    featured_image_alt: "98ceddce-5893-43a5-b0a0-2b2bbcee69cc.webp",
  },
];

// Load full collections from a sidecar if present; else minimal + rest filled by worker sync.
const collectionsPath = path.join(root, "scripts/_d1-collections-seed.json");
const allCollections = fs.existsSync(collectionsPath)
  ? JSON.parse(fs.readFileSync(collectionsPath, "utf8"))
  : collections;

const outDir = path.join(root, "scripts/_d1-sql-batches");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const batches = [];
batches.push(`DELETE FROM products; DELETE FROM collections; DELETE FROM medias; DELETE FROM catalog_meta;`);

const mediaSql = [];
const seen = new Set();
for (const c of allCollections) {
  if (c.featured_image_id && !seen.has(c.featured_image_id)) {
    seen.add(c.featured_image_id);
    mediaSql.push(
      `INSERT OR REPLACE INTO medias (id, key, alt) VALUES (${esc(c.featured_image_id)}, ${esc(c.featured_image_key || "")}, ${esc(c.featured_image_alt || "")});`,
    );
  }
}
for (const p of products) {
  if (p.featured_image_id && !seen.has(p.featured_image_id)) {
    seen.add(p.featured_image_id);
    mediaSql.push(
      `INSERT OR REPLACE INTO medias (id, key, alt) VALUES (${esc(p.featured_image_id)}, ${esc(p.featured_image_key || "")}, ${esc(p.featured_image_alt || "")});`,
    );
  }
}

const collectionSql = allCollections.map(
  (c) =>
    `INSERT OR REPLACE INTO collections (id, label, slug, title, description, sort_order, featured_image_id, featured_image_key, featured_image_alt) VALUES (${esc(c.id)}, ${esc(c.label)}, ${esc(c.slug)}, ${esc(c.title)}, ${esc(c.description)}, ${c.sort_order == null ? "NULL" : Number(c.sort_order)}, ${esc(c.featured_image_id)}, ${esc(c.featured_image_key)}, ${esc(c.featured_image_alt)});`,
);

const productSql = products.map((p) => {
  const tags =
    typeof p.tags === "string" ? p.tags : JSON.stringify(p.tags ?? []);
  return `INSERT OR REPLACE INTO products (id, name, slug, product_code, is_draft, description, featured, badge, rating, tags, price, discount_enabled, discount_percent, sold_as_pack, pack_size, stock, collection_id, featured_image_id, featured_image_key, featured_image_alt, is_digital, created_at, archived_at) VALUES (${esc(p.id)}, ${esc(p.name)}, ${esc(p.slug)}, ${esc(p.product_code)}, ${p.is_draft ? 1 : 0}, ${esc(p.description)}, ${p.featured ? 1 : 0}, ${esc(p.badge)}, ${esc(String(p.rating ?? "4"))}, ${esc(tags)}, ${esc(String(p.price ?? "0.00"))}, ${p.discount_enabled ? 1 : 0}, ${p.discount_percent == null ? "NULL" : Number(p.discount_percent)}, ${p.sold_as_pack ? 1 : 0}, ${p.pack_size == null ? "NULL" : Number(p.pack_size)}, ${p.stock == null ? 8 : Number(p.stock)}, ${esc(p.collection_id)}, ${esc(p.featured_image_id)}, ${esc(p.featured_image_key)}, ${esc(p.featured_image_alt)}, ${p.is_digital ? 1 : 0}, ${esc(p.created_at)}, ${esc(p.archived_at)});`;
});

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

let n = 0;
for (const part of [
  batches[0],
  ...chunk(mediaSql, 30).map((x) => x.join("\n")),
  ...chunk(collectionSql, 20).map((x) => x.join("\n")),
  ...chunk(productSql, 8).map((x) => x.join("\n")),
  `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('synced_at', ${esc(new Date().toISOString())});
INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('product_count', '${products.length}');
INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('collection_count', '${allCollections.length}');`,
]) {
  const file = path.join(outDir, `batch-${String(n).padStart(3, "0")}.sql`);
  fs.writeFileSync(file, part);
  n += 1;
}

console.log(
  JSON.stringify({
    batches: n,
    products: products.length,
    collections: allCollections.length,
    medias: seen.size,
    outDir,
  }),
);
