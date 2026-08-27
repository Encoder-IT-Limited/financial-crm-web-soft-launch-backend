-- Public settings (branding, legal, social), plan seat ranges, contact form, OTP reset.

ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "tagline" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "logo_url" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "contact_email" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'AED';
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "privacy_body" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "terms_body" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "privacy_last_updated" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "terms_last_updated" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "linkedin" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "twitter" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "instagram" TEXT;

ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "min_seats" INTEGER;
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "max_seats" INTEGER;
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "sales_assisted" BOOLEAN NOT NULL DEFAULT false;

UPDATE "subscription_plans" SET "min_seats" = "base_seats" WHERE "min_seats" IS NULL;
UPDATE "subscription_plans" SET "sales_assisted" = true WHERE lower("name") LIKE '%enterprise%';

CREATE TABLE IF NOT EXISTS "contact_inquiries" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_inquiries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "password_reset_tokens_email_idx" ON "password_reset_tokens"("email");
