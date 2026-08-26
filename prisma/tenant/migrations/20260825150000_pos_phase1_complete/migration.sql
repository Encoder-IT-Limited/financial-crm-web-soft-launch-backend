-- Manager PIN on tenant users (POS discounts / voids / refunds / exchanges)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "manager_pin_hash" TEXT;

-- Sellable vs quarantine stock. Available-to-sell stays on "quantity".
ALTER TABLE "stock_balances" ADD COLUMN IF NOT EXISTS "damaged_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "products_barcode_idx" ON "products"("barcode");

-- Enum extensions
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'QUARANTINE';
ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'EXCHANGED';

DO $$ BEGIN
  CREATE TYPE "PosDiscountType" AS ENUM ('PERCENTAGE', 'FIXED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PosSyncFailureStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISCARDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SaleExchangeDirection" AS ENUM ('RETURN', 'REPLACE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "pos_discount_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PosDiscountType" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_discount_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pos_sync_failures" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "offline_transaction_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "last_error" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "status" "PosSyncFailureStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,

    CONSTRAINT "pos_sync_failures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_sync_failures_device_id_offline_transaction_key_key"
  ON "pos_sync_failures"("device_id", "offline_transaction_key");

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "invoice_id" UUID;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "approved_by" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "sales_invoice_id_key" ON "sales"("invoice_id");

DO $$ BEGIN
  ALTER TABLE "sales"
    ADD CONSTRAINT "sales_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "discount_rule_id" UUID;
ALTER TABLE "sale_returns" ADD COLUMN IF NOT EXISTS "approved_by" UUID;

CREATE TABLE IF NOT EXISTS "sale_exchanges" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "refund_amount" DECIMAL(14,2) NOT NULL,
    "replacement_amount" DECIMAL(14,2) NOT NULL,
    "net_amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT,
    "approved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_exchanges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sale_exchange_items" (
    "id" UUID NOT NULL,
    "exchange_id" UUID NOT NULL,
    "direction" "SaleExchangeDirection" NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "condition" "SaleReturnCondition",

    CONSTRAINT "sale_exchange_items_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "sale_exchanges"
    ADD CONSTRAINT "sale_exchanges_sale_id_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sale_exchange_items"
    ADD CONSTRAINT "sale_exchange_items_exchange_id_fkey"
    FOREIGN KEY ("exchange_id") REFERENCES "sale_exchanges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
