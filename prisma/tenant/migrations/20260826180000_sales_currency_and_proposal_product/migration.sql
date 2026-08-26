-- Persist document currency (tenant default is applied at create time) and
-- allow proposal lines to carry a productId through convert-to-invoice.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "debit_notes" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "recurring_invoice_templates" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "proposal_items" ADD COLUMN IF NOT EXISTS "product_id" UUID;
