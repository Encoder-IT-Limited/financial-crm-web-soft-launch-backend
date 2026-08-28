-- CreateTable
CREATE TABLE "user_invites" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "invited_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_invites_token_hash_key" ON "user_invites"("token_hash");
CREATE INDEX "user_invites_tenant_id_idx" ON "user_invites"("tenant_id");
CREATE INDEX "user_invites_user_id_idx" ON "user_invites"("user_id");
CREATE INDEX "user_invites_email_idx" ON "user_invites"("email");

ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
