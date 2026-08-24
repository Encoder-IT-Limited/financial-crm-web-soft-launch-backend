import type { Request, Response, NextFunction } from "express";
import { AppError } from "../common/errors";
import { isTenantWritable } from "../platform/tenantStatus";

export function requireTenantWritable(req: Request, _res: Response, next: NextFunction) {
  if (!req.tenant) return next();
  if (!isTenantWritable(req.tenant.status, req.tenant.lifecycle)) {
    return next(
      new AppError(403, "TENANT_SUSPENDED", "This tenant's subscription has expired. Read access only."),
    );
  }
  next();
}
