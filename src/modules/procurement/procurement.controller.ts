import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../common/errors";
import { requireParam } from "../../common/params";
import * as v from "./procurement.validators";
import * as procurementService from "./procurement.service";

function ctx(req: Request) {
  if (!req.tenant || !req.tenantPrisma) throw new AppError(400, "TENANT_REQUIRED", "Tenant subdomain required");
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Not authenticated");
  return { tenantId: req.tenant.id, tenantPrisma: req.tenantPrisma, userId: req.user.id };
}

export async function listSuppliersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await procurementService.listSuppliers(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function createSupplierHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const input = v.createSupplierSchema.parse(req.body);
    res.status(201).json(await procurementService.createSupplier(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function listPurchaseOrdersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await procurementService.listPurchaseOrders(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function getPurchaseOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await procurementService.getPurchaseOrder(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function createPurchaseOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const input = v.createPurchaseOrderSchema.parse(req.body);
    res.status(201).json(await procurementService.createPurchaseOrder(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function submitPurchaseOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await procurementService.submitPurchaseOrder(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function approvePurchaseOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, userId } = ctx(req);
    res.json(await procurementService.approvePurchaseOrder(tenantPrisma, requireParam(req, "id"), userId));
  } catch (err) {
    next(err);
  }
}

export async function rejectPurchaseOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await procurementService.rejectPurchaseOrder(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function closePurchaseOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await procurementService.closePurchaseOrder(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function createGoodsReceiptHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const input = v.createGoodsReceiptSchema.parse(req.body);
    res
      .status(201)
      .json(await procurementService.createGoodsReceipt(tenantPrisma, tenantId, requireParam(req, "id"), input.items, userId));
  } catch (err) {
    next(err);
  }
}

export async function listGoodsReceiptsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await procurementService.listGoodsReceipts(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function createPurchaseInvoiceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const input = v.createPurchaseInvoiceSchema.parse(req.body);
    res.status(201).json(await procurementService.createPurchaseInvoice(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function listPurchaseInvoicesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await procurementService.listPurchaseInvoices(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function recordSupplierPaymentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const input = v.recordSupplierPaymentSchema.parse(req.body);
    res
      .status(201)
      .json(await procurementService.recordSupplierPayment(tenantPrisma, tenantId, requireParam(req, "id"), input, userId));
  } catch (err) {
    next(err);
  }
}
