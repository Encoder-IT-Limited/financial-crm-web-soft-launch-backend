import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../common/errors";
import { requireParam } from "../../common/params";
import * as v from "./pos.validators";
import * as posService from "./pos.service";

function ctx(req: Request) {
  if (!req.tenant || !req.tenantPrisma) throw new AppError(400, "TENANT_REQUIRED", "Tenant subdomain required");
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Not authenticated");
  return { tenantId: req.tenant.id, tenantPrisma: req.tenantPrisma, userId: req.user.id };
}

export async function listTerminalsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await posService.listTerminals(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function createTerminalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const input = v.createTerminalSchema.parse(req.body);
    res.status(201).json(await posService.createTerminal(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function openSessionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const input = v.openSessionSchema.parse(req.body);
    res.status(201).json(await posService.openSession(tenantPrisma, tenantId, input, userId));
  } catch (err) {
    next(err);
  }
}

export async function closeSessionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const input = v.closeSessionSchema.parse(req.body);
    res.json(await posService.closeSession(tenantPrisma, requireParam(req, "id"), input.closingCash));
  } catch (err) {
    next(err);
  }
}

export async function createSaleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const input = v.createSaleSchema.parse(req.body);
    res.status(201).json(await posService.createSale(tenantPrisma, tenantId, input, userId));
  } catch (err) {
    next(err);
  }
}

export async function listSalesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await posService.listSales(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function getSaleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await posService.getSale(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function refundSaleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const input = v.refundSaleSchema.parse(req.body);
    res
      .status(201)
      .json(await posService.refundSale(tenantPrisma, tenantId, requireParam(req, "id"), input.items, input.reason, userId));
  } catch (err) {
    next(err);
  }
}

export async function voidSaleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    res.json(await posService.voidSale(tenantPrisma, tenantId, requireParam(req, "id"), userId));
  } catch (err) {
    next(err);
  }
}
