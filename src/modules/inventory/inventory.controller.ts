import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../utils/errors";
import { requireParam } from "../../utils/params";
import { ok } from "../../utils/envelope";
import * as v from "./inventory.validation";
import * as inventoryService from "./inventory.service";
import { compactQuery } from "./inventory.helpers";

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
    const query = v.listProductsQuerySchema.parse(req.query);
    const { items, meta } = await inventoryService.listProducts(tenantPrisma, query);
    res.json(ok(items, meta));
  } catch (err) {
    next(err);
  }
}

export async function lookupProductByBarcodeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const barcode = typeof req.query.barcode === "string" ? req.query.barcode.trim() : "";
    if (!barcode) throw new AppError(400, "BARCODE_REQUIRED", "barcode query parameter is required");
    res.json(await inventoryService.lookupProductByBarcode(tenantPrisma, barcode));
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

export async function updateProductHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const input = v.updateProductSchema.parse(req.body);
    res.json(await inventoryService.updateProduct(tenantPrisma, requireParam(req, "id"), input));
  } catch (err) {
    next(err);
  }
}

export async function deleteProductHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await inventoryService.deleteProduct(tenantPrisma, requireParam(req, "id")));
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

export async function updateWarehouseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const input = v.updateWarehouseSchema.parse(req.body);
    res.json(await inventoryService.updateWarehouse(tenantPrisma, requireParam(req, "id"), input));
  } catch (err) {
    next(err);
  }
}

export async function deleteWarehouseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await inventoryService.deleteWarehouse(tenantPrisma, requireParam(req, "id")));
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

export async function writeOffDamagedHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const input = v.writeOffDamagedSchema.parse(req.body);
    res.status(201).json(await inventoryService.writeOffDamaged(tenantPrisma, tenantId, input, userId));
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

export async function getProductHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const product = await inventoryService.getProduct(tenantPrisma, requireParam(req, "id"));
    if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    res.json(product);
  } catch (err) {
    next(err);
  }
}

export async function getWarehouseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const warehouse = await inventoryService.getWarehouse(tenantPrisma, requireParam(req, "id"));
    if (!warehouse) throw new AppError(404, "WAREHOUSE_NOT_FOUND", "Warehouse not found");
    res.json(warehouse);
  } catch (err) {
    next(err);
  }
}

export async function listStockHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const query = v.listStockQuerySchema.parse(compactQuery(req.query as Record<string, unknown>));
    res.json(await inventoryService.listStockBalances(tenantPrisma, query.warehouseId));
  } catch (err) {
    next(err);
  }
}

export async function listTransfersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const query = v.listTransfersQuerySchema.parse(compactQuery(req.query as Record<string, unknown>));
    const { items, meta } = await inventoryService.listTransfers(tenantPrisma, query);
    res.json(ok(items, meta));
  } catch (err) {
    next(err);
  }
}

export async function getTransferHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const transfer = await inventoryService.getTransfer(tenantPrisma, requireParam(req, "id"));
    if (!transfer) throw new AppError(404, "TRANSFER_NOT_FOUND", "Stock transfer not found");
    res.json(transfer);
  } catch (err) {
    next(err);
  }
}

export async function listMovementsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await inventoryService.listMovements(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function listBatchesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await inventoryService.listBatches(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function getDashboardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await inventoryService.getDashboard(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function listReorderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const query = v.listStockQuerySchema.parse(compactQuery(req.query as Record<string, unknown>));
    res.json(await inventoryService.listReorder(tenantPrisma, query.warehouseId));
  } catch (err) {
    next(err);
  }
}

export async function getValuationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const query = v.listStockQuerySchema.parse(compactQuery(req.query as Record<string, unknown>));
    res.json(await inventoryService.getValuation(tenantPrisma, query.warehouseId));
  } catch (err) {
    next(err);
  }
}
