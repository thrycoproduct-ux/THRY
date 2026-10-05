-- Per-unit shipping weight for weight-wise courier. Existing products get 0.5 kg (< 1 kg slab).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS weight_kg numeric(8,3) NOT NULL DEFAULT 0.5;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_weight_kg_positive;
ALTER TABLE products
  ADD CONSTRAINT products_weight_kg_positive CHECK (weight_kg > 0 AND weight_kg <= 1000);

COMMENT ON COLUMN products.weight_kg IS 'Shipping weight of one unit in kg; used by weight-wise courier slabs';
