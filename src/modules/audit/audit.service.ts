import type { Prisma } from "../../generated/public-client/client";
import { publicPrisma } from "../../db/publicPrisma";
import { parsePageQuery, pageMeta, isPagedQuery, type PageQuery } from "../../utils/pagination";
import type { RequestUser } from "../../types/express";

export async function writeAudit(input: {
  actor?: RequestUser;
  tenantId?: string | null;
  tenantName?: string | null;
  module: string;
  entity: string;
  entityLabel: string;
  action: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string;
}) {
  await publicPrisma.platformAuditLog.create({
    data: {
      userId: input.actor?.realm === "admin" ? input.actor.id : null,
      userName: input.actor?.name ?? input.actor?.email ?? "system",
      userEmail: input.actor?.email ?? "system",
      tenantId: input.tenantId ?? null,
      tenantName: input.tenantName ?? null,
      module: input.module,
      entity: input.entity,
      entityLabel: input.entityLabel,
      action: input.action,
      oldValues: (input.oldValues ?? undefined) as Prisma.InputJsonValue | undefined,
      newValues: (input.newValues ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: input.ipAddress,
    },
  });
}

export function toAuditDto(row: {
  id: string;
  createdAt: Date;
  userName: string;
  userEmail: string;
  tenantId: string | null;
  tenantName: string | null;
  module: string;
  entity: string;
  entityLabel: string;
  action: string;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
}) {
  return {
    id: row.id,
    timestamp: row.createdAt.toISOString(),
    userName: row.userName,
    userEmail: row.userEmail,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    module: row.module,
    entity: row.entity,
    entityLabel: row.entityLabel,
    action: row.action,
    oldValues: row.oldValues,
    newValues: row.newValues,
    ipAddress: row.ipAddress,
  };
}

function auditWhere(filters: {
  tenantId?: string;
  module?: string;
  action?: string;
  q?: string;
  from?: string;
  to?: string;
}): Prisma.PlatformAuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (filters.from) createdAt.gte = new Date(`${filters.from}T00:00:00.000Z`);
  if (filters.to) createdAt.lte = new Date(`${filters.to}T23:59:59.999Z`);
  const q = filters.q?.trim();
  return {
    tenantId: filters.tenantId,
    module: filters.module,
    action: filters.action,
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(q
      ? {
          OR: [
            { entityLabel: { contains: q, mode: "insensitive" } },
            { userName: { contains: q, mode: "insensitive" } },
            { tenantName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export function listAudit(
  filters: { tenantId?: string; module?: string; action?: string; q?: string; from?: string; to?: string },
  opts?: { take?: number },
) {
  return publicPrisma.platformAuditLog.findMany({
    where: auditWhere(filters),
    orderBy: { createdAt: "desc" },
    take: opts?.take ?? 200,
  });
}

export async function listAuditPage(
  filters: { tenantId?: string; module?: string; action?: string; q?: string; from?: string; to?: string },
  query: PageQuery,
) {
  const { page, pageSize, skip } = parsePageQuery(query);
  const where = auditWhere(filters);
  const [total, rows] = await Promise.all([
    publicPrisma.platformAuditLog.count({ where }),
    publicPrisma.platformAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);
  return { items: rows, meta: pageMeta(total, page, pageSize) };
}

export { isPagedQuery };
