import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import { defaultGrantsForRole } from "../utils/permissions";
import { permissionAllowed } from "../utils/permissionCheck";
import { resolveRoleGrants } from "../utils/roleGrants";

export function requirePermission(...required: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError(401, "UNAUTHENTICATED", "Not authenticated");
      }
      if (req.user.realm === "admin") {
        return next();
      }
      const granted =
        req.tenantPrisma && req.tenant
          ? await resolveRoleGrants(req.tenantPrisma, req.tenant.id, req.user.role)
          : defaultGrantsForRole(req.user.role);
      const ok = required.some((perm) => permissionAllowed(granted, perm));
      if (!ok) {
        throw new AppError(403, "FORBIDDEN", `Requires one of: ${required.join(", ")}`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
