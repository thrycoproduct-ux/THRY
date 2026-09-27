#!/usr/bin/env node
/**
 * Compare the live thry-catalog D1 mirror with Supabase (source of truth).
 *
 *   node scripts/catalog-d1-parity.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / CATALOG_WORKER_URL
 * from the environment or .env.local. Exits 1 on any mismatch.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function loadEnvLocal() {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

const identity = JSON.parse(
  fs.readFileSync(path.join(root, "project.identity.json"), "utf8"),
);
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const workerUrl = (
  process.env.CATALOG_WORKER_URL || identity.cloudflare.catalogWorkerUrl
).replace(/\/$/, "");

if (!supabaseUrl.includes(identity.supabase.projectRef)) {
  console.error(
    `Refusing: Supabase URL is not the ${identity.project.name} project (${identity.supabase.projectRef}).`,
  );
  process.exit(2);
}
if (!anonKey) {
  console.error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.");
  process.exit(2);
}

async function supabase(pathAndQuery) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function worker(pathAndQuery) {
  const res = await fetch(`${workerUrl}${pathAndQuery}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`worker ${res.status}: ${await res.text()}`);
  return res.json();
}

async function allWorkerProducts(sort) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const page = await worker(`/products?limit=100&offset=${offset}&sort=${sort}`);
    out.push(...(page.products ?? []));
    if (!page.hasMore) return out;
  }
}

const num = (v) => (v == null ? null : Number(v));
const bool = (v) => Boolean(Number(v) || v === true);

const productFields = {
  slug: (r) => r.slug,
  name: (r) => r.name,
  price: (r) => num(r.price),
  discount_enabled: (r) => bool(r.discount_enabled),
  discount_percent: (r) => num(r.discount_percent),
  sold_as_pack: (r) => bool(r.sold_as_pack),
  pack_size: (r) => num(r.pack_size),
  stock: (r) => num(r.stock),
  featured: (r) => bool(r.featured),
  collection_id: (r) => r.collection_id ?? null,
  featured_image_key: (r) => r.featured_image_key ?? r.medias?.key ?? null,
};

const collectionFields = {
  slug: (r) => r.slug,
  label: (r) => r.label,
  sort_order: (r) => num(r.sort_order ?? r.order),
  featured_image_key: (r) => r.featured_image_key ?? r.medias?.key ?? null,
};

function diffRows(kind, sourceRows, mirrorRows, fields) {
  const problems = [];
  const mirrorById = new Map(mirrorRows.map((r) => [r.id, r]));
  const sourceIds = new Set(sourceRows.map((r) => r.id));
  for (const src of sourceRows) {
    const m = mirrorById.get(src.id);
    if (!m) {
      problems.push(`${kind} missing in D1: ${src.slug ?? src.id}`);
      continue;
    }
    for (const [field, get] of Object.entries(fields)) {
      const a = get(src);
      const b = get(m);
      if (a !== b) {
        problems.push(
          `${kind} ${src.slug ?? src.id}.${field}: supabase=${JSON.stringify(a)} d1=${JSON.stringify(b)}`,
        );
      }
    }
  }
  for (const m of mirrorRows) {
    if (!sourceIds.has(m.id)) {
      problems.push(`${kind} extra in D1 (not live in Supabase): ${m.slug ?? m.id}`);
    }
  }
  return problems;
}

const [sbProducts, sbCollections, d1ByName, d1Collections, health] =
  await Promise.all([
    supabase(
      "products?select=id,name,slug,price,discount_enabled,discount_percent,sold_as_pack,pack_size,stock,featured,collection_id,medias(key)&archived_at=is.null&is_draft=eq.false&order=name.asc,id.asc",
    ),
    supabase("collections?select=id,label,slug,order,medias(key)"),
    allWorkerProducts("name_asc"),
    worker("/collections").then((d) => d.collections ?? []),
    worker("/health"),
  ]);

const problems = [
  ...diffRows("product", sbProducts, d1ByName, productFields),
  ...diffRows("collection", sbCollections, d1Collections, collectionFields),
];

const sbOrder = sbProducts.map((p) => p.id).join(",");
const d1Order = d1ByName.map((p) => p.id).join(",");
if (problems.length === 0 && sbOrder !== d1Order) {
  problems.push("name_asc order differs between Supabase and D1");
}

const meta = health.meta ?? {};
console.log(
  JSON.stringify(
    {
      supabase: { products: sbProducts.length, collections: sbCollections.length },
      d1: { products: d1ByName.length, collections: d1Collections.length },
      syncedAt: meta.synced_at,
      lastSyncSource: meta.last_sync_source ?? null,
      lastSyncError: meta.last_sync_error ?? null,
      nameOrderMatches: sbOrder === d1Order,
      mismatches: problems.length,
    },
    null,
    2,
  ),
);
for (const p of problems.slice(0, 50)) console.log(" -", p);
if (problems.length > 50) console.log(` ... and ${problems.length - 50} more`);
process.exit(problems.length ? 1 : 0);
