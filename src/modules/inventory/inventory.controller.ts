import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../common/errors";
import { requireParam } from "../../common/params";
import * as v from "./inventory.validators";
import * as inventoryService from "./inventory.service";

function ctx(req: Request) {
  if (!req.tenant || !req.tenantPrisma) throw new AppError(400, "TENANT_REQUIRED", "Tenant subdomain required");
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Not authenticated");
  return { tenantId: req.tenant.id, tenantPrisma: req.tenantPrisma, userId: req.user.id };
}

export async function listCategoriesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await inventoryService.listCategories(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function createCategoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const input = v.createCategorySchema.parse(req.body);
    res.status(201).json(await inventoryService.createCategory(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function listUnitsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await inventoryService.listUnits(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function createUnitHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const input = v.createUnitSchema.parse(req.body);
    res.status(201).json(await inventoryService.createUnit(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function listProductsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await inventoryService.listProducts(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function createProductHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const input = v.createProductSchema.parse(req.body);
    res.status(201).json(await inventoryService.createProduct(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function listWarehousesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await inventoryService.listWarehouses(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function createWarehouseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const input = v.createWarehouseSchema.parse(req.body);
    res.status(201).json(await inventoryService.createWarehouse(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function receiveStockHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const input = v.receiveStockSchema.parse(req.body);
    res.status(201).json(await inventoryService.receiveStock(tenantPrisma, tenantId, input, userId));
  } catch (err) {
    next(err);
  }
}

export async function issueStockHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const input = v.issueStockSchema.parse(req.body);
    res.status(201).json(await inventoryService.issueStock(tenantPrisma, tenantId, input, userId));
  } catch (err) {
    next(err);
  }
}

export async function adjustStockHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const input = v.adjustStockSchema.parse(req.body);
    res.status(201).json(await inventoryService.adjustStock(tenantPrisma, tenantId, input, userId));
  } catch (err) {
    next(err);
  }
}

export async function requestTransferHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const input = v.createTransferSchema.parse(req.body);
    res.status(201).json(await inventoryService.requestTransfer(tenantPrisma, tenantId, input, userId));
  } catch (err) {
    next(err);
  }
}

export async function approveTransferHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, userId } = ctx(req);
    res.json(await inventoryService.approveTransfer(tenantPrisma, requireParam(req, "id"), userId));
  } catch (err) {
    next(err);
  }
}

export async function dispatchTransferHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    res.json(await inventoryService.dispatchTransfer(tenantPrisma, tenantId, requireParam(req, "id"), userId));
  } catch (err) {
    next(err);
  }
}

export async function receiveTransferHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    res.json(await inventoryService.receiveTransfer(tenantPrisma, tenantId, requireParam(req, "id"), userId));
  } catch (err) {
    next(err);
  }
}
