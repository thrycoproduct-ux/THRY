-- Internal paid-order reference: YYMM + 4-digit monthly sequence (e.g. 26090001).
-- Displayed with the THRY prefix (THRY26090001).
-- Assigned when payment becomes paid (not at checkout create).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS internal_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_internal_ref_unique
  ON public.orders (internal_ref)
  WHERE internal_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_internal_ref_counters (
  yymm text PRIMARY KEY,
  last_seq integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_internal_ref_counters_last_seq_positive CHECK (last_seq >= 0)
);

-- Only the server (direct Postgres connection) touches the counters.
ALTER TABLE public.order_internal_ref_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_internal_ref_counters FROM anon, authenticated;

COMMENT ON COLUMN public.orders.internal_ref IS
  'Human invoice-style ref YYMM#### assigned on first paid transition (IST month).';

COMMENT ON TABLE public.order_internal_ref_counters IS
  'Per-month sequence counters for orders.internal_ref allocation.';
