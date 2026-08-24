import type { Request, Response, NextFunction } from "express";
import { requireParam } from "../../utils/params";
import { requireTenantAuth } from "../../utils/tenantContext";
import { createCustomerSchema, updateCustomerSchema } from "./customers.validation";
import * as customersService from "./customers.service";

export async function listCustomersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    res.json(await customersService.listCustomers(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function getCustomerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    res.json(await customersService.getCustomer(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function createCustomerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = requireTenantAuth(req);
    const input = createCustomerSchema.parse(req.body);
    res.status(201).json(await customersService.createCustomer(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function updateCustomerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    const input = updateCustomerSchema.parse(req.body);
    res.json(await customersService.updateCustomer(tenantPrisma, requireParam(req, "id"), input));
  } catch (err) {
    next(err);
  }
}
