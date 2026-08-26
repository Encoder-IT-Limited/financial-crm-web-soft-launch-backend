import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import { ROLE_PERMISSIONS } from "../utils/permissions";
import { permissionAllowed } from "../utils/permissionCheck";

export function requirePermission(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "UNAUTHENTICATED", "Not authenticated"));
    }
    const granted = ROLE_PERMISSIONS[req.user.role] ?? ["*.view"];
    const ok = required.some((perm) => permissionAllowed(granted, perm));
    if (!ok) {
      return next(new AppError(403, "FORBIDDEN", `Requires one of: ${required.join(", ")}`));
    }
    next();
  };
}
