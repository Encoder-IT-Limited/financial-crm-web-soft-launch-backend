-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RetainerBillingModel" AS ENUM ('ONE_TIME', 'RECURRING');

-- CreateEnum
CREATE TYPE "RetainerStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED');

-- AlterTable
ALTER TABLE "recurring_invoice_templates" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'INVOICE';
ALTER TABLE "recurring_invoice_templates" ADD COLUMN IF NOT EXISTS "retainer_id" UUID;

-- CreateTable
CREATE TABLE "proposals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "proposal_number" TEXT NOT NULL,
    "proposal_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "sent_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "converted_invoice_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_items" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "proposal_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retainers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "retainer_number" TEXT NOT NULL,
    "contract_amount" DECIMAL(14,2) NOT NULL,
    "remaining_balance" DECIMAL(14,2) NOT NULL,
    "billing_period" TEXT NOT NULL,
    "billing_model" "RetainerBillingModel" NOT NULL DEFAULT 'ONE_TIME',
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "status" "RetainerStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE NOT NULL,
    "expiry_date" DATE,
    "notes" TEXT,
    "funding_invoice_id" UUID,
    "disposition_reason" TEXT,
    "transferred_to_retainer_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retainers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retainer_usage" (
    "id" UUID NOT NULL,
    "retainer_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retainer_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proposals_proposal_number_key" ON "proposals"("proposal_number");

-- CreateIndex
CREATE UNIQUE INDEX "retainers_retainer_number_key" ON "retainers"("retainer_number");

-- AddForeignKey
ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retainer_usage" ADD CONSTRAINT "retainer_usage_retainer_id_fkey" FOREIGN KEY ("retainer_id") REFERENCES "retainers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
