-- Super Admin / platform tables and plan-shape updates. Tenant isolation
-- status enum is unchanged; frontend lifecycle (active / read-only /
-- pending-deletion / cancelled) lives on tenants.lifecycle.

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "lifecycle" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "extra_seats" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "billing_cycle" TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "pending_deletion_at" TIMESTAMP(3);

ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "price_monthly" DECIMAL(10,2);
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "price_yearly" DECIMAL(10,2);
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "additional_seat_price" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "trial_days" INTEGER NOT NULL DEFAULT 14;
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "modules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "popular" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "subscription_plans"
SET
  "price_monthly" = COALESCE("price_monthly", "price"),
  "price_yearly" = COALESCE("price_yearly", ROUND("price" * 12 * 0.8, 2))
WHERE "price_monthly" IS NULL OR "price_yearly" IS NULL;

ALTER TABLE "subscription_plans" ALTER COLUMN "price_monthly" SET NOT NULL;
ALTER TABLE "subscription_plans" ALTER COLUMN "price_yearly" SET NOT NULL;

ALTER TABLE "subscription_plans" DROP COLUMN IF EXISTS "price";
ALTER TABLE "subscription_plans" DROP COLUMN IF EXISTS "billing_cycle";

CREATE TABLE IF NOT EXISTS "platform_users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_users_email_key" ON "platform_users"("email");

CREATE TABLE IF NOT EXISTS "platform_refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_refresh_tokens_token_hash_key" ON "platform_refresh_tokens"("token_hash");

CREATE TABLE IF NOT EXISTS "platform_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "platform_audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT NOT NULL,
    "tenant_id" UUID,
    "tenant_name" TEXT,
    "module" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_label" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "platform_name" TEXT NOT NULL DEFAULT 'MRM',
    "primary_color" TEXT,
    "retention_days" INTEGER NOT NULL DEFAULT 60,
    "seat_limit_message" TEXT NOT NULL DEFAULT 'You''ve reached your plan''s seat limit. Upgrade your plan or purchase additional seats.',
    "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
    "maintenance_message" TEXT,
    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "platform_settings" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;

DO $$
BEGIN
  ALTER TABLE "platform_refresh_tokens"
    ADD CONSTRAINT "platform_refresh_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "platform_payments"
    ADD CONSTRAINT "platform_payments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "platform_audit_logs"
    ADD CONSTRAINT "platform_audit_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "platform_audit_logs"
    ADD CONSTRAINT "platform_audit_logs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
