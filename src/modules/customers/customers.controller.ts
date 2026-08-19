import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../common/errors";
import { createCustomerSchema } from "./customers.validators";

export async function listCustomersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant || !req.tenantPrisma) throw new AppError(400, "TENANT_REQUIRED", "Tenant subdomain required");
    const customers = await req.tenantPrisma.customer.findMany({ orderBy: { createdAt: "desc" } });
    res.json(customers);
  } catch (err) {
    next(err);
  }
}

export async function createCustomerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant || !req.tenantPrisma) throw new AppError(400, "TENANT_REQUIRED", "Tenant subdomain required");
    const input = createCustomerSchema.parse(req.body);

    const customer = await req.tenantPrisma.customer.create({
      data: {
        tenantId: req.tenant.id,
        customerCode: input.customerCode ?? `CUST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        name: input.name,
        email: input.email,
        phone: input.phone,
        address: input.address,
      },
    });
    res.status(201).json(customer);
  } catch (err) {
    next(err);
  }
}
