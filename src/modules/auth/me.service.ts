import type { Request } from "express";
import { publicPrisma } from "../../db/publicPrisma";
import type { Me } from "../../utils/me";
import { defaultGrantsForRole } from "../../utils/permissions";
import { resolveRoleGrants } from "../../utils/roleGrants";

export async function buildMe(req: Request): Promise<Me> {
  if (!req.user) throw new Error("buildMe called without req.user");

  if (req.user.realm === "admin") {
    return {
      id: req.user.id,
      name: req.user.name ?? req.user.email,
      email: req.user.email,
      role: req.user.role,
      realm: "admin",
      permissions: ["*"],
    };
  }

  const tenant = req.tenant;
  const subscription = tenant
    ? await publicPrisma.subscription.findFirst({
        where: { tenantId: tenant.id },
        include: { plan: true },
        orderBy: { startDate: "desc" },
      })
    : null;

  return {
    id: req.user.id,
    name: req.user.name ?? req.user.email,
    email: req.user.email,
    role: req.user.role,
    realm: "tenant",
    permissions:
      req.tenantPrisma && req.tenant
        ? await resolveRoleGrants(req.tenantPrisma, req.tenant.id, req.user.role)
        : defaultGrantsForRole(req.user.role),
    tenant: tenant
      ? {
          id: tenant.id,
          name: tenant.name,
          subdomain: tenant.subdomain,
          plan: subscription?.plan.name ?? "none",
          activeModules: subscription?.plan.modules ?? [],
          legalName: tenant.legalName,
          email: tenant.email,
          phone: tenant.phone,
          address: tenant.address,
          taxNumber: tenant.taxNumber,
          currency: tenant.currency,
        }
      : undefined,
  };
}
