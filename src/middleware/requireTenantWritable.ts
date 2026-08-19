import type { Request, Response, NextFunction } from "express";
import { AppError } from "../common/errors";

// Per docs/requirements-qa.md: an expired subscription suspends the tenant
// immediately (no grace period) — users can still log in and read/export
// data, but cannot create new transactions until payment is resolved. Mount
// this on mutating (POST/PUT/PATCH/DELETE) tenant-scoped routes only.
export function requireTenantWritable(req: Request, _res: Response, next: NextFunction) {
  if (req.tenant?.status === "SUSPENDED") {
    return next(
      new AppError(403, "TENANT_SUSPENDED", "This tenant's subscription has expired. Read access only."),
    );
  }
  next();
}
