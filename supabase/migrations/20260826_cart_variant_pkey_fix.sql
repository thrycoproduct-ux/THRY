-- Fix carts PK so multiple variants of the same product can coexist.
-- Prior migration 20260824 added columns but left PRIMARY KEY (user_id, product_id).

-- 1) Ensure line id exists and is populated
ALTER TABLE public.carts
ADD COLUMN IF NOT EXISTS id text;

UPDATE public.carts
SET id = gen_random_uuid()::text
WHERE id IS NULL OR btrim(id) = '';

ALTER TABLE public.carts
ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
ALTER COLUMN id SET NOT NULL;

-- 2) Ensure variant columns exist
ALTER TABLE public.carts
ADD COLUMN IF NOT EXISTS size text,
ADD COLUMN IF NOT EXISTS selections jsonb,
ADD COLUMN IF NOT EXISTS variant_key text;

UPDATE public.carts
SET variant_key = 'default'
WHERE variant_key IS NULL OR btrim(variant_key) = '';

ALTER TABLE public.carts
ALTER COLUMN variant_key SET DEFAULT 'default',
ALTER COLUMN variant_key SET NOT NULL;

-- 3) Backfill variant_key from selections (same shape as buildCartVariantKey)
UPDATE public.carts c
SET variant_key = sub.vk
FROM (
  SELECT
    c2.ctid AS row_ctid,
    string_agg(
      e.key || '=' || upper(btrim(e.value)),
      '|' ORDER BY e.key
    ) AS vk
  FROM public.carts c2
  CROSS JOIN LATERAL jsonb_each_text(COALESCE(c2.selections, '{}'::jsonb)) AS e(key, value)
  WHERE c2.variant_key = 'default'
    AND c2.selections IS NOT NULL
    AND c2.selections <> '{}'::jsonb
    AND btrim(e.value) <> ''
  GROUP BY c2.ctid
) AS sub
WHERE c.ctid = sub.row_ctid
  AND sub.vk IS NOT NULL
  AND btrim(sub.vk) <> '';

-- 4) Backfill from legacy size when still default
UPDATE public.carts
SET variant_key = 'size=' || upper(btrim(size))
WHERE variant_key = 'default'
  AND size IS NOT NULL
  AND btrim(size) <> '';

-- 5) Deduplicate (user_id, product_id, variant_key): merge qty into one row
WITH ranked AS (
  SELECT
    ctid,
    id,
    quantity,
    SUM(quantity) OVER (
      PARTITION BY user_id, product_id, variant_key
    ) AS total_qty,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, product_id, variant_key
      ORDER BY created_at DESC NULLS LAST, id
    ) AS rn
  FROM public.carts
)
UPDATE public.carts c
SET quantity = ranked.total_qty
FROM ranked
WHERE c.ctid = ranked.ctid
  AND ranked.rn = 1
  AND c.quantity IS DISTINCT FROM ranked.total_qty;

WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, product_id, variant_key
      ORDER BY created_at DESC NULLS LAST, id
    ) AS rn
  FROM public.carts
)
DELETE FROM public.carts c
USING ranked
WHERE c.ctid = ranked.ctid
  AND ranked.rn > 1;

-- 6) Replace composite PK with surrogate line id
ALTER TABLE public.carts
DROP CONSTRAINT IF EXISTS carts_pkey;

ALTER TABLE public.carts
DROP CONSTRAINT IF EXISTS user_poduct_cart_id;

ALTER TABLE public.carts
DROP CONSTRAINT IF EXISTS user_product_cart_id;

ALTER TABLE public.carts
ADD CONSTRAINT carts_pkey PRIMARY KEY (id);

-- 7) Business unique key for merge-on-same-variant
DROP INDEX IF EXISTS user_product_variant_cart_uid;
CREATE UNIQUE INDEX user_product_variant_cart_uid
ON public.carts (user_id, product_id, variant_key);

-- 8) order_lines snapshot columns (idempotent)
ALTER TABLE public.order_lines
ADD COLUMN IF NOT EXISTS size text,
ADD COLUMN IF NOT EXISTS selections jsonb;
