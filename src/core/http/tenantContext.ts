import type { Request } from "express";
import { AppError } from "../../common/errors";
import type { PrismaClient as TenantPrismaClient } from "../../generated/tenant-client/client";
import type { RequestTenant, RequestUser } from "../../common/types/express";

export function requireTenant(req: Request): {
  tenant: RequestTenant;
  tenantPrisma: TenantPrismaClient;
} {
  if (!req.tenant || !req.tenantPrisma) {
    throw new AppError(400, "TENANT_REQUIRED", "This endpoint must be called on a tenant subdomain");
  }
  return { tenant: req.tenant, tenantPrisma: req.tenantPrisma };
}

export function requireAuth(req: Request): RequestUser {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Not authenticated");
  return req.user;
}

export function requireTenantAuth(req: Request) {
  const { tenant, tenantPrisma } = requireTenant(req);
  const user = requireAuth(req);
  return { tenant, tenantPrisma, user, tenantId: tenant.id, userId: user.id };
}
