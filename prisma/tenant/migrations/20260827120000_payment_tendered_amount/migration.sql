-- Record cash handed over vs amount applied to the sale/invoice.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "tendered_amount" DECIMAL(14, 2);
