import type { Request, Response, NextFunction } from "express";
import { LRUCache } from "lru-cache";
import { publicPrisma } from "../db/publicPrisma";
import { getTenantPrismaClient } from "../db/tenantClientCache";
import { env } from "../config/env";
import { AppError } from "../utils/errors";
import { parseSubdomain } from "./subdomain";
import type { RequestTenant } from "../types/express";

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
    legalName: tenant.legalName,
    email: tenant.email,
    phone: tenant.phone,
    address: tenant.address,
    taxNumber: tenant.taxNumber,
    currency: tenant.currency,
  };
  subdomainCache.set(subdomain, resolved);
  return resolved;
}

function isIpHost(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** Soft-launch / SPA: allow explicit tenant header on root API host (IP or ROOT_DOMAIN). */
function allowTenantHeader(host: string): boolean {
  return env.NODE_ENV !== "production" || host === env.ROOT_DOMAIN || isIpHost(host);
}

function subdomainFromRequest(req: Request): string | null {
  const header = req.headers["x-tenant-subdomain"];
  if (typeof header === "string" && header.length > 0 && allowTenantHeader(req.hostname)) {
    return header;
  }

  const softLaunchDefault = () =>
    process.env.NEXT_PUBLIC_DEV_TENANT_SUBDOMAIN || process.env.DEV_TENANT_SUBDOMAIN || "demo";

  try {
    const fromHost = parseSubdomain(req.hostname, env.ROOT_DOMAIN);
    // Bare root/IP API (no subdomain in host) — soft-launch SPA still needs a tenant.
    if (fromHost === null && allowTenantHeader(req.hostname)) {
      return softLaunchDefault();
    }
    return fromHost;
  } catch (err) {
    if (allowTenantHeader(req.hostname)) {
      const host = req.hostname;
      const isDevHost =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "0.0.0.0" ||
        isIpHost(host) ||
        host === env.ROOT_DOMAIN;
      if (isDevHost) {
        return softLaunchDefault();
      }
    }
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
