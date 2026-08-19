import type { Request, Response, NextFunction } from "express";
import { AppError } from "../common/errors";
import type { Role } from "../generated/tenant-client/client";

// Requires authenticate to have already run and populated req.user.role.
export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "UNAUTHENTICATED", "Not authenticated"));
    }
    if (!allowed.includes(req.user.role as Role)) {
      return next(new AppError(403, "FORBIDDEN", `Requires one of: ${allowed.join(", ")}`));
    }
    next();
  };
}
