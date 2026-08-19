import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// TENANT_MIGRATION_DATABASE_URL must already be schema-qualified
// (?schema=<name>). For interactive `prisma migrate dev` it points at the
// reference schema (see .env). src/db/migrateTenantSchema.ts overrides this
// env var per-invocation to replay migrations onto a specific real tenant
// schema instead. See docs/database-design.md §1a.
export default defineConfig({
  schema: "schema.prisma",
  migrations: {
    path: "migrations",
  },
  datasource: {
    url: env("TENANT_MIGRATION_DATABASE_URL"),
  },
});
