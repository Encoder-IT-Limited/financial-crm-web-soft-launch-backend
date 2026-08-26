-- Terminal shift access code + optional cashier display name on sessions
ALTER TABLE "pos_terminals" ADD COLUMN IF NOT EXISTS "access_code_hash" TEXT;
ALTER TABLE "pos_sessions" ADD COLUMN IF NOT EXISTS "cashier_name" TEXT;
