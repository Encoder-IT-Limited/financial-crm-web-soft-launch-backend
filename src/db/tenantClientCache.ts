import { LRUCache } from "lru-cache";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/tenant-client/client";
import { env } from "../config/env";

// Postgres identifiers can't be parameterized, and this string gets
// interpolated directly into a raw connection option and (at provisioning
// time) raw DDL — so every caller of getTenantPrismaClient must pass a value
// that has already been validated against this pattern.
export const TENANT_SCHEMA_NAME_RE = /^tenant_[a-z0-9_]{1,50}$/;

interface CachedTenantClient {
  client: PrismaClient;
  pool: Pool;
}

// Bounded so we never hold more than a fixed number of tenant connection
// pools open at once, and TTL-evicted so idle tenants don't sit on
// connections forever. See docs/database-design.md §1a for the connection
// budget math (max * per-pool max = worst-case connection ceiling).
const cache = new LRUCache<string, CachedTenantClient>({
  max: 120,
  ttl: 15 * 60 * 1000,
  updateAgeOnGet: true,
  dispose: ({ client, pool }) => {
    client.$disconnect().catch(() => {});
    pool.end().catch(() => {});
  },
});

export function getTenantPrismaClient(schemaName: string): PrismaClient {
  if (!TENANT_SCHEMA_NAME_RE.test(schemaName)) {
    throw new Error(`Invalid tenant schema name: ${schemaName}`);
  }

  const hit = cache.get(schemaName);
  if (hit) return hit.client;

  const pool = new Pool({
    connectionString: env.TENANT_DATABASE_URL,
    options: `-c search_path="${schemaName}"`,
    max: 3,
  });
  const adapter = new PrismaPg(pool, { schema: schemaName });
  const client = new PrismaClient({ adapter });

  cache.set(schemaName, { client, pool });
  return client;
}

export async function closeAllTenantClients(): Promise<void> {
  cache.clear();
}
