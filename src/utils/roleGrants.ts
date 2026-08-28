import { LRUCache } from "lru-cache";
import type { PrismaClient as TenantPrisma } from "../generated/tenant-client/client";
import { defaultGrantsForRole } from "./permissions";

const cache = new LRUCache<string, string[]>({
  max: 5000,
  ttl: 30_000,
});

function cacheKey(tenantId: string, roleKey: string) {
  return `${tenantId}:${roleKey}`;
}

export function invalidateRoleGrants(tenantId?: string) {
  if (!tenantId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${tenantId}:`)) cache.delete(key);
  }
}

export async function resolveRoleGrants(
  db: TenantPrisma,
  tenantId: string,
  roleKey: string,
): Promise<string[]> {
  const key = cacheKey(tenantId, roleKey);
  const hit = cache.get(key);
  if (hit) return hit;

  const row = await db.role.findFirst({ where: { tenantId, key: roleKey } });
  const grants = row ? row.permissions : defaultGrantsForRole(roleKey);
  cache.set(key, grants);
  return grants;
}
