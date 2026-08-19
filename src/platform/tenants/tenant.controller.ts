import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../common/errors";
import { provisionTenantSchema } from "./tenant.validators";
import { provisionTenant } from "./tenant.service";

export async function createTenantHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.tenant) {
      throw new AppError(400, "ROOT_DOMAIN_ONLY", "Tenant creation must be called on the root domain");
    }
    const input = provisionTenantSchema.parse(req.body);
    const tenant = await provisionTenant(input);
    res.status(201).json({
      id: tenant.id,
      name: tenant.name,
      subdomain: tenant.subdomain,
      status: tenant.status,
    });
  } catch (err) {
    next(err);
  }
}
