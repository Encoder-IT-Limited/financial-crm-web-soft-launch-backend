import type { PrismaClient as TenantPrisma } from "../../generated/tenant-client/client";
import { systemRoleSeeds } from "../../utils/permissions";

export async function seedSystemRoles(db: TenantPrisma, tenantId: string) {
  for (const seed of systemRoleSeeds()) {
    await db.role.upsert({
      where: { tenantId_key: { tenantId, key: seed.key } },
      create: {
        tenantId,
        key: seed.key,
        name: seed.name,
        isSystem: true,
        countsTowardSeats: seed.countsTowardSeats,
        permissions: seed.permissions,
      },
      update: {},
    });
  }
}

export async function requireSystemRoleId(db: TenantPrisma, tenantId: string, key: string) {
  const existing = await db.role.findFirst({ where: { tenantId, key } });
  if (existing) return existing;
  await seedSystemRoles(db, tenantId);
  const created = await db.role.findFirst({ where: { tenantId, key } });
  if (!created) throw new Error(`Failed to seed system role ${key}`);
  return created;
}
