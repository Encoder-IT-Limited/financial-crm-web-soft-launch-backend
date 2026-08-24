import type { PrismaClient as TenantPrismaClient } from "../generated/tenant-client/client";
import type { TenantStatus } from "../generated/public-client/client";

export interface RequestTenant {
  id: string;
  subdomain: string;
  schemaName: string;
  status: TenantStatus;
  lifecycle: string;
  name: string;
}

export interface RequestUser {
  id: string;
  email: string;
  role: string;
  realm: "admin" | "tenant";
  name?: string;
  tenantId?: string;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: RequestTenant | null;
      tenantPrisma?: TenantPrismaClient;
      user?: RequestUser;
    }
  }
}

export {};
