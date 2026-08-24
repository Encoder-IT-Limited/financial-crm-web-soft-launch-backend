import type { Request, Response, NextFunction } from "express";
import { LRUCache } from "lru-cache";
import { publicPrisma } from "../db/publicPrisma";
import { getTenantPrismaClient } from "../db/tenantClientCache";
import { env } from "../config/env";
import { AppError } from "../common/errors";
import { parseSubdomain } from "./subdomain";
import type { RequestTenant } from "../common/types/express";

const subdomainCache = new LRUCache<string, RequestTenant>({
  max: 5000,
  ttl: 60 * 1000,
});

export function invalidateTenantCache(subdomain?: string) {
  if (subdomain) subdomainCache.delete(subdomain);
  else subdomainCache.clear();
}

async function resolveTenantBySubdomain(subdomain: string): Promise<RequestTenant | null> {
  const cached = subdomainCache.get(subdomain);
  if (cached) return cached;

  const tenant = await publicPrisma.tenant.findUnique({ where: { subdomain } });
  if (!tenant) return null;

  const resolved: RequestTenant = {
    id: tenant.id,
    name: tenant.name,
    subdomain: tenant.subdomain,
    schemaName: tenant.schemaName,
    status: tenant.status,
    lifecycle: tenant.lifecycle,
  };
  subdomainCache.set(subdomain, resolved);
  return resolved;
}

function subdomainFromRequest(req: Request): string | null {
  const header = req.headers["x-tenant-subdomain"];
  if (typeof header === "string" && header.length > 0 && env.NODE_ENV !== "production") {
    return header;
  }

  try {
    return parseSubdomain(req.hostname, env.ROOT_DOMAIN);
  } catch (err) {
    if (env.NODE_ENV !== "production" && req.hostname === "localhost") return null;
    throw err;
  }
}

export async function tenantResolver(req: Request, _res: Response, next: NextFunction) {
  try {
    const subdomain = subdomainFromRequest(req);
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
