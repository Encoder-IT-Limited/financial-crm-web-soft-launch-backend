-- AlterTable invoices
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable retainers
ALTER TABLE "retainers" ADD COLUMN IF NOT EXISTS "rolled_over_from_retainer_id" UUID;
ALTER TABLE "retainers" ADD COLUMN IF NOT EXISTS "rolled_over_to_retainer_id" UUID;
ALTER TABLE "retainers" ADD COLUMN IF NOT EXISTS "refund_adjustment_id" UUID;

-- CreateTable invoice_fulfillments
CREATE TABLE IF NOT EXISTS "invoice_fulfillments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "delivery_note_number" TEXT,
    "notes" TEXT,
    "fulfilled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilled_by" UUID NOT NULL,

    CONSTRAINT "invoice_fulfillments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_fulfillments_delivery_note_number_key"
  ON "invoice_fulfillments"("delivery_note_number");

-- CreateTable invoice_fulfillment_lines
CREATE TABLE IF NOT EXISTS "invoice_fulfillment_lines" (
    "id" UUID NOT NULL,
    "fulfillment_id" UUID NOT NULL,
    "invoice_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FULFILLED',

    CONSTRAINT "invoice_fulfillment_lines_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "invoice_fulfillments"
    ADD CONSTRAINT "invoice_fulfillments_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoice_fulfillment_lines"
    ADD CONSTRAINT "invoice_fulfillment_lines_fulfillment_id_fkey"
    FOREIGN KEY ("fulfillment_id") REFERENCES "invoice_fulfillments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
