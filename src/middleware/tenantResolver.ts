import type { Request, Response, NextFunction } from "express";
import { LRUCache } from "lru-cache";
import { publicPrisma } from "../db/publicPrisma";
import { getTenantPrismaClient } from "../db/tenantClientCache";
import { env } from "../config/env";
import { AppError } from "../common/errors";
import { parseSubdomain } from "./subdomain";
import type { RequestTenant } from "../common/types/express";

// Short-lived cache so every request doesn't hit the public schema just to
// resolve which tenant a subdomain belongs to.
const subdomainCache = new LRUCache<string, RequestTenant>({
  max: 5000,
  ttl: 60 * 1000,
});

async function resolveTenantBySubdomain(subdomain: string): Promise<RequestTenant | null> {
  const cached = subdomainCache.get(subdomain);
  if (cached) return cached;

  const tenant = await publicPrisma.tenant.findUnique({ where: { subdomain } });
  if (!tenant) return null;

  const resolved: RequestTenant = {
    id: tenant.id,
    subdomain: tenant.subdomain,
    schemaName: tenant.schemaName,
    status: tenant.status,
  };
  subdomainCache.set(subdomain, resolved);
  return resolved;
}

// Resolves the tenant from the request's subdomain and attaches `req.tenant`
// + `req.tenantPrisma`. Root-domain requests (no subdomain) fall through with
// `req.tenant = null`, for platform-level routes like tenant registration.
export async function tenantResolver(req: Request, _res: Response, next: NextFunction) {
  try {
    const subdomain = parseSubdomain(req.hostname, env.ROOT_DOMAIN);
    if (subdomain === null) {
      req.tenant = null;
      return next();
    }

    const tenant = await resolveTenantBySubdomain(subdomain);
    if (!tenant) {
      throw new AppError(404, "TENANT_NOT_FOUND", `No tenant found for subdomain: ${subdomain}`);
    }
    if (tenant.status === "PROVISIONING") {
      throw new AppError(503, "TENANT_PROVISIONING", "This tenant is still being provisioned");
    }
    if (tenant.status === "FAILED") {
      throw new AppError(503, "TENANT_PROVISIONING_FAILED", "This tenant failed provisioning");
    }

    req.tenant = tenant;
    req.tenantPrisma = getTenantPrismaClient(tenant.schemaName);
    next();
  } catch (err) {
    next(err);
  }
}
