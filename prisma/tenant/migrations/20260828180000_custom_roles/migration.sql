-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "counts_toward_seats" BOOLEAN NOT NULL DEFAULT true,
    "permissions" TEXT[] NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_tenant_id_key_key" ON "roles"("tenant_id", "key");

-- Seed system roles for every tenant that already has users
INSERT INTO "roles" ("id", "tenant_id", "key", "name", "is_system", "counts_toward_seats", "permissions", "created_at", "updated_at")
SELECT gen_random_uuid(), t."tenant_id", v."key", v."name", true, v."counts_toward_seats", v."permissions", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "tenant_id" FROM "users") t
CROSS JOIN (
    VALUES
        ('OWNER', 'Owner', true, ARRAY['*']::TEXT[]),
        ('ADMIN', 'Admin', true, ARRAY['*']::TEXT[]),
        ('MANAGER', 'Manager', true, ARRAY['inventory.*','procurement.*','pos.*','invoice.*','customer.*']::TEXT[]),
        ('INVENTORY_MANAGER', 'Inventory Manager', true, ARRAY['inventory.*','procurement.*']::TEXT[]),
        ('SALES_CASHIER', 'Sales / Cashier', true, ARRAY['pos.view','pos.createSale','pos.refund','invoice.view','invoice.create','customer.*']::TEXT[]),
        ('ACCOUNTANT', 'Accountant', true, ARRAY['invoice.*','customer.view']::TEXT[]),
        ('VIEWER', 'Viewer', false, ARRAY['*.view']::TEXT[])
) AS v("key", "name", "counts_toward_seats", "permissions");

ALTER TABLE "users" ADD COLUMN "role_id" UUID;

UPDATE "users" u
SET "role_id" = r."id"
FROM "roles" r
WHERE r."tenant_id" = u."tenant_id" AND r."key" = u."role"::text;

ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE TEXT USING "role"::text;
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'OWNER';

DROP TYPE "Role";
