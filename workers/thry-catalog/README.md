# thry-catalog Worker

D1 catalog mirror for THRY. Supabase remains source of truth; this Worker syncs a read copy into D1 and exposes `/sync`, `/health`, `/products`, `/collections`.

## Bindings

- D1 `DB` → `thry-catalog` (`85283c0d-4c77-4187-8d68-ff166a1a6d50`, APAC)
- Secrets: `CATALOG_SYNC_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`

## Deploy

```bash
npx wrangler deploy --config workers/thry-catalog/wrangler.jsonc
npx wrangler secret bulk workers/thry-catalog/.secrets.local.json --config workers/thry-catalog/wrangler.jsonc
```

## App env (Vercel / .env.local)

```
CATALOG_READ=supabase
CATALOG_WORKER_URL=https://thry-catalog.<workers-subdomain>.workers.dev
CATALOG_SYNC_SECRET=<same as worker secret>
```

Keep `CATALOG_READ=supabase` until mirror sync is validated. Admin invalidate calls `POST /sync` best-effort when URL+secret are set.

## Live

- Worker: https://thry-catalog.thrycoproduct.workers.dev
- D1: `thry-catalog` / `85283c0d-4c77-4187-8d68-ff166a1a6d50` (APAC)
