import type { PrismaClient as TenantPrisma } from "../../generated/tenant-client/client";
import { AppError } from "../../utils/errors";
import { PERMISSION_CATALOG, sanitizePermissions, uniqueRoleKey } from "../../utils/permissions";
import { invalidateRoleGrants } from "../../utils/roleGrants";
import { seedSystemRoles } from "./roles.seed";
import type { RoleDto } from "./users.dto";

export function assertRolePatch(role: { key: string }, patch: { permissions?: string[] }) {
  if (role.key === "OWNER" && patch.permissions !== undefined) {
    throw new AppError(400, "OWNER_LOCKED", "The owner role permissions cannot be changed");
  }
}

export function assertRoleDelete(role: { key: string; isSystem: boolean }, userCount: number) {
  if (role.isSystem || role.key === "OWNER") {
    throw new AppError(400, "SYSTEM_ROLE", "System roles cannot be deleted");
  }
  if (userCount > 0) {
    throw new AppError(409, "ROLE_IN_USE", "Reassign users before deleting this role");
  }
}

function toRoleDto(
  row: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    permissions: string[];
    isSystem: boolean;
    countsTowardSeats: boolean;
    _count?: { users: number };
  },
  userCount?: number,
): RoleDto {
  const count = userCount ?? row._count?.users ?? 0;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    label: row.name,
    description: row.description,
    permissions: row.permissions,
    isSystem: row.isSystem,
    countsTowardSeats: row.countsTowardSeats,
    invitable: row.key !== "OWNER",
    userCount: count,
  };
}

export function permissionCatalog() {
  return PERMISSION_CATALOG;
}

export async function listRoles(tenantPrisma: TenantPrisma, tenantId: string): Promise<RoleDto[]> {
  let rows = await tenantPrisma.role.findMany({
    where: { tenantId },
    include: { _count: { select: { users: true } } },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  if (rows.length === 0) {
    await seedSystemRoles(tenantPrisma, tenantId);
    rows = await tenantPrisma.role.findMany({
      where: { tenantId },
      include: { _count: { select: { users: true } } },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
  }
  return rows.map((row) => toRoleDto(row));
}

export async function findAssignableRole(tenantPrisma: TenantPrisma, tenantId: string, key: string) {
  if (key === "OWNER") {
    throw new AppError(400, "CANNOT_ASSIGN_OWNER", "The owner role cannot be assigned");
  }
  const role = await tenantPrisma.role.findFirst({ where: { tenantId, key } });
  if (!role) throw new AppError(400, "ROLE_NOT_FOUND", "Role not found");
  return role;
}

export async function createRole(
  tenantPrisma: TenantPrisma,
  tenantId: string,
  input: { name: string; description?: string | null; countsTowardSeats?: boolean; permissions: string[] },
): Promise<RoleDto> {
  const existing = await tenantPrisma.role.findMany({ where: { tenantId }, select: { key: true } });
  const key = uniqueRoleKey(
    input.name,
    existing.map((r) => r.key),
  );
  if (key === "OWNER") {
    throw new AppError(400, "ROLE_KEY_RESERVED", "That role key is reserved");
  }
  const row = await tenantPrisma.role.create({
    data: {
      tenantId,
      key,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      isSystem: false,
      countsTowardSeats: input.countsTowardSeats ?? true,
      permissions: sanitizePermissions(input.permissions),
    },
    include: { _count: { select: { users: true } } },
  });
  invalidateRoleGrants(tenantId);
  return toRoleDto(row);
}

export async function updateRole(
  tenantPrisma: TenantPrisma,
  tenantId: string,
  roleId: string,
  input: { name?: string; description?: string | null; countsTowardSeats?: boolean; permissions?: string[] },
): Promise<RoleDto> {
  const role = await tenantPrisma.role.findFirst({
    where: { id: roleId, tenantId },
    include: { _count: { select: { users: true } } },
  });
  if (!role) throw new AppError(404, "ROLE_NOT_FOUND", "Role not found");
  assertRolePatch(role, input);

  const permissions =
    role.key === "OWNER" ? ["*"] : input.permissions !== undefined ? sanitizePermissions(input.permissions) : undefined;

  const row = await tenantPrisma.role.update({
    where: { id: role.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.countsTowardSeats !== undefined && role.key !== "OWNER"
        ? { countsTowardSeats: input.countsTowardSeats }
        : {}),
      ...(permissions !== undefined ? { permissions } : {}),
    },
    include: { _count: { select: { users: true } } },
  });
  invalidateRoleGrants(tenantId);
  return toRoleDto(row);
}

export async function deleteRole(tenantPrisma: TenantPrisma, tenantId: string, roleId: string) {
  const role = await tenantPrisma.role.findFirst({
    where: { id: roleId, tenantId },
    include: { _count: { select: { users: true } } },
  });
  if (!role) throw new AppError(404, "ROLE_NOT_FOUND", "Role not found");
  assertRoleDelete(role, role._count.users);
  await tenantPrisma.role.delete({ where: { id: role.id } });
  invalidateRoleGrants(tenantId);
  return { deleted: true };
}
