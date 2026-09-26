-- Catalog mirror schema for thry-catalog D1 (APAC)
CREATE TABLE IF NOT EXISTS medias (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL,
  alt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER,
  featured_image_id TEXT,
  featured_image_key TEXT,
  featured_image_alt TEXT
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  product_code TEXT,
  is_draft INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  featured INTEGER DEFAULT 0,
  badge TEXT,
  rating TEXT NOT NULL DEFAULT '4',
  tags TEXT NOT NULL DEFAULT '[]',
  price TEXT NOT NULL DEFAULT '0.00',
  discount_enabled INTEGER NOT NULL DEFAULT 0,
  discount_percent INTEGER,
  sold_as_pack INTEGER NOT NULL DEFAULT 0,
  pack_size INTEGER,
  stock INTEGER DEFAULT 8,
  collection_id TEXT,
  featured_image_id TEXT NOT NULL,
  featured_image_key TEXT,
  featured_image_alt TEXT,
  is_digital INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_collection ON products(collection_id);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);
CREATE INDEX IF NOT EXISTS idx_products_draft ON products(is_draft);
CREATE INDEX IF NOT EXISTS idx_collections_slug ON collections(slug);
CREATE TABLE IF NOT EXISTS catalog_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
