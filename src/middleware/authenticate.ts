import type { Request, Response, NextFunction } from "express";
import { AppError } from "../common/errors";
import { verifyAccessToken } from "../modules/auth/jwt";

// Requires tenantResolver to have already run. Verifies the access JWT and
// confirms its tenantId claim matches the tenant resolved from the
// subdomain — a token issued on one tenant must never authenticate on
// another, even if the signature is otherwise valid.
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.tenant) {
      throw new AppError(400, "TENANT_REQUIRED", "This endpoint must be called on a tenant subdomain");
    }

    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AppError(401, "UNAUTHENTICATED", "Missing bearer token");
    }
    const token = header.slice("Bearer ".length);

    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch {
      throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired access token");
    }

    if (claims.tenantId !== req.tenant.id) {
      throw new AppError(401, "UNAUTHENTICATED", "Token does not belong to this tenant");
    }

    req.user = { id: claims.sub, email: claims.email, role: claims.role };
    next();
  } catch (err) {
    next(err);
  }
}
