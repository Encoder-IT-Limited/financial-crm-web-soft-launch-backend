-- Persist a reason/note on stock movements (used by inventory adjustments).
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "note" TEXT;
