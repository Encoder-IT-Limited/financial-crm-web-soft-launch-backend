import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { publicPrisma } from "./publicPrisma";
import { TENANT_SCHEMA_NAME_RE } from "./tenantClientCache";
import { env } from "../config/env";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const TENANT_PRISMA_CONFIG = path.join(PROJECT_ROOT, "prisma/tenant/prisma.config.ts");

// Creates the tenant's Postgres schema (if missing) and replays the full
// tenant migration history onto it by spawning the Prisma CLI with
// TENANT_DATABASE_URL overridden to point at that schema. See
// docs/database-design.md §1a — fine for a handful of tenants; needs a
// concurrency-limited or raw-SQL runner once tenant count grows past the low
// hundreds (not needed for this slice).
export async function migrateTenantSchema(schemaName: string): Promise<void> {
  if (!TENANT_SCHEMA_NAME_RE.test(schemaName)) {
    throw new Error(`Invalid tenant schema name: ${schemaName}`);
  }

  await publicPrisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  await execFileAsync(
    "npx",
    ["prisma", "migrate", "deploy", "--config", TENANT_PRISMA_CONFIG],
    {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        TENANT_MIGRATION_DATABASE_URL: `${env.TENANT_DATABASE_URL}?schema=${schemaName}`,
      },
    },
  );
}
