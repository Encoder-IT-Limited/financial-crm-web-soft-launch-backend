import type { Prisma } from "../../generated/public-client/client";
import { publicPrisma } from "../../db/publicPrisma";
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

export function listAudit(filters: { tenantId?: string; module?: string; action?: string }) {
  return publicPrisma.platformAuditLog.findMany({
    where: {
      tenantId: filters.tenantId,
      module: filters.module,
      action: filters.action,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
