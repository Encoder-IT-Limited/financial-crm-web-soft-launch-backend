import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import { verifyAccessToken } from "../utils/jwt";
import { readBearerOrCookie } from "../utils/cookies";

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    attachUser(req);
    if (req.user?.realm !== "tenant") {
      throw new AppError(401, "UNAUTHENTICATED", "Tenant session required");
    }
    if (!req.tenant) {
      throw new AppError(400, "TENANT_REQUIRED", "This endpoint must be called on a tenant subdomain");
    }
    if (req.user.tenantId && req.user.tenantId !== req.tenant.id) {
      throw new AppError(401, "UNAUTHENTICATED", "Token does not belong to this tenant");
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function authenticatePlatform(req: Request, _res: Response, next: NextFunction) {
  try {
    attachUser(req);
    if (req.user?.realm !== "admin") {
      throw new AppError(401, "UNAUTHENTICATED", "Super Admin session required");
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function authenticateAny(req: Request, _res: Response, next: NextFunction) {
  try {
    attachUser(req);
    next();
  } catch (err) {
    next(err);
  }
}

function attachUser(req: Request) {
  const token = readBearerOrCookie(req);
  if (!token) {
    throw new AppError(401, "UNAUTHENTICATED", "Missing bearer token");
  }

  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch {
    throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired access token");
  }

  req.user = {
    id: claims.sub,
    email: claims.email,
    role: claims.role,
    realm: claims.realm ?? (claims.tenantId ? "tenant" : "admin"),
    name: claims.name,
    tenantId: claims.tenantId,
  };
}
