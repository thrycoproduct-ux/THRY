# thry-catalog Worker

D1 catalog mirror for THRY. Supabase remains source of truth; this Worker syncs a read copy into D1 and exposes `/sync`, `/health`, `/products`, `/collections`.

## Bindings

- D1 `DB` → `thry-catalog` (`85283c0d-4c77-4187-8d68-ff166a1a6d50`, APAC)
- Secrets: `CATALOG_SYNC_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`

## Deploy

```bash
npx esbuild workers/thry-catalog/src/index.ts --bundle --format=esm --outfile=workers/thry-catalog/dist-worker.js --platform=neutral --target=es2022
npx wrangler deploy --config workers/thry-catalog/wrangler.jsonc
```

## App env

```
CATALOG_READ=d1
CATALOG_WORKER_URL=https://thry-catalog.thrycoproduct.workers.dev
CATALOG_SYNC_SECRET=<same as worker secret>
```

`CATALOG_READ=d1` enables featured, shop search, and PDP shell reads from D1 (Supabase fallback). Cart/checkout stay on Supabase.

## Products API

`GET /products`: `slug` (+ gallery), `featured=1`, `q`, `sort` (newest|name_asc|price_asc|price_desc|featured), `price_min`/`price_max` (effective), `collection_id`, `require_collection=1`, `limit`/`offset` → `{ products, hasMore }`.

## Live

- https://thry-catalog.thrycoproduct.workers.dev
