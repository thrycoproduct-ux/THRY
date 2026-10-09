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

function build(chunk, label) {
  const lines = chunk.map((p) =>
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
  return `async () => {
  const dbId = ${JSON.stringify(dbId)};
  const payload = ${JSON.stringify(payload)};
  function dec(s) {
    if (!s) return "";
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  function esc(v) {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  }
  const rows = payload.split("\\n").filter(Boolean);
  const stmts = [];
  for (const line of rows) {
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
    const res = await cloudflare.request({
      method: "POST",
      path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query",
      body: { sql },
    });
    if (!res.success) return { label: ${JSON.stringify(label)}, ok: false, at: i, errors: res.errors };
  }
  return { label: ${JSON.stringify(label)}, ok: true, rows: rows.length };
}`;
}

const size = Math.ceil(products.length / 4);
for (let i = 0; i < 4; i++) {
  const chunk = products.slice(i * size, (i + 1) * size);
  const code = build(chunk, `q${i}`);
  fs.writeFileSync(`scripts/_d1-mcp-apply/seed-q${i}.js`, code);
  console.log(`q${i}`, chunk.length, code.length);
}
