import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";

// Requires authenticate to have already run and populated req.user.role.
export function requireRole(...allowed: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "UNAUTHENTICATED", "Not authenticated"));
    }
    if (!allowed.includes(req.user.role)) {
      return next(new AppError(403, "FORBIDDEN", `Requires one of: ${allowed.join(", ")}`));
    }
    next();
  };
}
