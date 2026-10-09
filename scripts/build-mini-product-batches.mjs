import fs from "node:fs";

const products = JSON.parse(
  fs.readFileSync("scripts/_d1-products-compact.json", "utf8"),
);
const dbId = "85283c0d-4c77-4187-8d68-ff166a1a6d50";
const out = "scripts/_d1-mcp-apply/mini";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

function esc(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

const BATCH = 5;
let bi = 0;
for (let i = 0; i < products.length; i += BATCH) {
  const chunk = products.slice(i, i + BATCH);
  const stmts = [];
  for (const p of chunk) {
    stmts.push(
      `INSERT OR REPLACE INTO medias (id, key, alt) VALUES (${esc(p.featured_image_id)}, ${esc(p.featured_image_key || "")}, ${esc(p.featured_image_alt || "")})`,
    );
    stmts.push(
      `INSERT OR REPLACE INTO products (id, name, slug, product_code, is_draft, description, featured, badge, rating, tags, price, discount_enabled, discount_percent, sold_as_pack, pack_size, stock, collection_id, featured_image_id, featured_image_key, featured_image_alt, is_digital, created_at, archived_at) VALUES (${esc(p.id)}, ${esc(p.name)}, ${esc(p.slug)}, ${esc(p.product_code)}, ${p.is_draft}, ${esc("")}, ${p.featured}, ${esc(p.badge)}, ${esc(p.rating)}, ${esc("[]")}, ${esc(p.price)}, ${p.discount_enabled}, ${p.discount_percent == null ? "NULL" : Number(p.discount_percent)}, ${p.sold_as_pack}, ${p.pack_size == null ? "NULL" : Number(p.pack_size)}, ${Number(p.stock)}, ${esc(p.collection_id)}, ${esc(p.featured_image_id)}, ${esc(p.featured_image_key)}, ${esc(p.featured_image_alt)}, ${p.is_digital}, ${esc(p.created_at)}, ${esc(p.archived_at)})`,
    );
  }
  const sql = stmts.join(";\n") + ";";
  const code = `async () => { const dbId=${JSON.stringify(dbId)}; const sql=${JSON.stringify(sql)}; const res=await cloudflare.request({method:"POST",path:"/accounts/"+accountId+"/d1/database/"+dbId+"/query",body:{sql}}); return {b:${bi},ok:res.success,err:res.errors}; }`;
  fs.writeFileSync(`${out}/m-${String(bi).padStart(2, "0")}.js`, code);
  bi += 1;
}
console.log(
  JSON.stringify({
    batches: bi,
    avg: Math.round(
      fs
        .readdirSync(out)
        .map((f) => fs.statSync(`${out}/${f}`).size)
        .reduce((a, b) => a + b, 0) / bi,
    ),
  }),
);
