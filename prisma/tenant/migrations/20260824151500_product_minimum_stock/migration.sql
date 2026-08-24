-- AlterTable
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "minimum_stock" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Goods receipts always create batches; default new products to batch tracking.
ALTER TABLE "products" ALTER COLUMN "track_batch" SET DEFAULT true;
