ALTER TABLE public.carts
ADD COLUMN IF NOT EXISTS id text;

UPDATE public.carts
SET id = gen_random_uuid()::text
WHERE id IS NULL;

ALTER TABLE public.carts
ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.carts
ADD COLUMN IF NOT EXISTS size text,
ADD COLUMN IF NOT EXISTS selections jsonb,
ADD COLUMN IF NOT EXISTS variant_key text NOT NULL DEFAULT 'default';

ALTER TABLE public.carts
DROP CONSTRAINT IF EXISTS user_poduct_cart_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'carts_pkey'
  ) THEN
    ALTER TABLE public.carts
    ADD CONSTRAINT carts_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS user_product_variant_cart_uid
ON public.carts(user_id, product_id, variant_key);

ALTER TABLE public.order_lines
ADD COLUMN IF NOT EXISTS size text,
ADD COLUMN IF NOT EXISTS selections jsonb;
