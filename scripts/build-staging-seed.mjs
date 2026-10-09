import fs from "node:fs";

const products = JSON.parse(
  fs.readFileSync("scripts/_d1-products-compact.json", "utf8"),
);
const dbId = "85283c0d-4c77-4187-8d68-ff166a1a6d50";

function enc(s) {
  if (s == null) return "";
  return Buffer.from(String(s), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const lines = products.map((p) =>
  [
    p.id,
    enc(p.name),
    p.slug,
    p.product_code || "",
    p.is_draft,
    p.featured,
    p.badge || "",
    p.rating,
    p.price,
    p.discount_enabled,
    p.discount_percent == null ? "" : p.discount_percent,
    p.sold_as_pack,
    p.pack_size == null ? "" : p.pack_size,
    p.stock,
    p.collection_id || "",
    p.featured_image_id,
    enc(p.featured_image_key || ""),
    enc(p.featured_image_alt || ""),
    p.is_digital,
    p.created_at || "",
    p.archived_at || "",
  ].join("\t"),
);
const payload = lines.join("\n");

const CHUNK = 6000;
const parts = [];
for (let i = 0; i < payload.length; i += CHUNK) {
  parts.push(payload.slice(i, i + CHUNK));
}

const out = "scripts/_d1-mcp-apply/staging";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const setup = `async () => {
  const dbId = ${JSON.stringify(dbId)};
  const sql = "CREATE TABLE IF NOT EXISTS seed_staging (id INTEGER PRIMARY KEY, chunk TEXT NOT NULL); DELETE FROM seed_staging;";
  const res = await cloudflare.request({ method: "POST", path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query", body: { sql } });
  return { ok: res.success, errors: res.errors, parts: ${parts.length} };
}`;
fs.writeFileSync(`${out}/00-setup.js`, setup);

parts.forEach((part, i) => {
  const code = `async () => {
  const dbId = ${JSON.stringify(dbId)};
  const chunk = ${JSON.stringify(part)};
  const res = await cloudflare.request({
    method: "POST",
    path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query",
    body: {
      sql: "INSERT OR REPLACE INTO seed_staging (id, chunk) VALUES (?, ?)",
      params: [${i}, chunk],
    },
  });
  return { id: ${i}, ok: res.success, errors: res.errors, len: chunk.length };
}`;
  fs.writeFileSync(`${out}/p-${String(i).padStart(2, "0")}.js`, code);
});

const processCode = `async () => {
  const dbId = ${JSON.stringify(dbId)};
  const load = await cloudflare.request({
    method: "POST",
    path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query",
    body: { sql: "SELECT id, chunk FROM seed_staging ORDER BY id;" },
  });
  if (!load.success) return { ok: false, stage: "load", errors: load.errors };
  const rows = (load.result && load.result[0] && load.result[0].results) || [];
  const payload = rows.map((r) => r.chunk).join("");
  function dec(s) {
    if (!s) return "";
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }
  function esc(v) {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  }
  const lines = payload.split("\\n").filter(Boolean);
  const stmts = [];
  for (const line of lines) {
    const f = line.split("\\t");
    const id=f[0], name=dec(f[1]), slug=f[2], productCode=f[3]||null;
    const is_draft=+f[4], featured=+f[5], badge=f[6]||null, rating=f[7], price=f[8];
    const discount_enabled=+f[9], discount_percent=f[10]===""?null:+f[10];
    const sold_as_pack=+f[11], pack_size=f[12]===""?null:+f[12], stock=+f[13];
    const collection_id=f[14]||null, featured_image_id=f[15];
    const featured_image_key=dec(f[16]), featured_image_alt=dec(f[17]);
    const is_digital=+f[18], created_at=f[19]||null, archived_at=f[20]||null;
    stmts.push("INSERT OR REPLACE INTO medias (id, key, alt) VALUES (" + esc(featured_image_id) + ", " + esc(featured_image_key) + ", " + esc(featured_image_alt) + ")");
    stmts.push("INSERT OR REPLACE INTO products (id, name, slug, product_code, is_draft, description, featured, badge, rating, tags, price, discount_enabled, discount_percent, sold_as_pack, pack_size, stock, collection_id, featured_image_id, featured_image_key, featured_image_alt, is_digital, created_at, archived_at) VALUES (" + [
      esc(id), esc(name), esc(slug), esc(productCode), is_draft, "''", featured, esc(badge), esc(rating), "'[]'", esc(price),
      discount_enabled, discount_percent==null?"NULL":discount_percent,
      sold_as_pack, pack_size==null?"NULL":pack_size, stock,
      esc(collection_id), esc(featured_image_id), esc(featured_image_key), esc(featured_image_alt),
      is_digital, esc(created_at), esc(archived_at)
    ].join(", ") + ")");
  }
  for (let i = 0; i < stmts.length; i += 40) {
    const sql = stmts.slice(i, i + 40).join(";") + ";";
    const res = await cloudflare.request({ method: "POST", path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query", body: { sql } });
    if (!res.success) return { ok: false, stage: "insert", at: i, errors: res.errors };
  }
  await cloudflare.request({ method: "POST", path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query", body: { sql: "DROP TABLE IF EXISTS seed_staging; INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('synced_at', '" + new Date().toISOString() + "'); INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('product_count', '" + lines.length + "'); INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('collection_count', '16'); INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('seed_note', 'staging-tsv');" } });
  const counts = await cloudflare.request({ method: "POST", path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query", body: { sql: "SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM collections) AS collections, (SELECT COUNT(*) FROM medias) AS medias;" } });
  return { ok: true, lines: lines.length, counts: counts.result };
}`;
fs.writeFileSync(`${out}/zz-process.js`, processCode);

console.log(
  JSON.stringify({
    parts: parts.length,
    partFiles: parts.map((_, i) => fs.statSync(`${out}/p-${String(i).padStart(2, "0")}.js`).size),
    process: processCode.length,
  }),
);
