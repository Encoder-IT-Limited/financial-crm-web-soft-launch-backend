import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../common/errors";
import { loginSchema, refreshSchema } from "./auth.validators";
import * as authService from "./auth.service";

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant || !req.tenantPrisma) {
      throw new AppError(400, "TENANT_REQUIRED", "This endpoint must be called on a tenant subdomain");
    }
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(req.tenantPrisma, req.tenant.id, email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant || !req.tenantPrisma) {
      throw new AppError(400, "TENANT_REQUIRED", "This endpoint must be called on a tenant subdomain");
    }
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await authService.refresh(req.tenantPrisma, req.tenant.id, refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function meHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user || !req.tenantPrisma) {
      throw new AppError(401, "UNAUTHENTICATED", "Not authenticated");
    }
    const user = await req.tenantPrisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new AppError(401, "UNAUTHENTICATED", "Not authenticated");
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
}
