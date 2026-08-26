-- Optional max stock level for inventory UI / reorder planning
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "maximum_stock" DECIMAL(14, 2) NOT NULL DEFAULT 0;
