import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireTenantWritable } from "../../middlewares/requireTenantWritable";
import { requirePermission } from "../../middlewares/requirePermission";
import * as c from "./procurement.controller";

export const procurementRouter: Router = Router();

procurementRouter.use(authenticate);

procurementRouter.get("/suppliers", c.listSuppliersHandler);
procurementRouter.post("/suppliers", requireTenantWritable, c.createSupplierHandler);

procurementRouter.get("/purchase-orders", c.listPurchaseOrdersHandler);
procurementRouter.post("/purchase-orders", requireTenantWritable, c.createPurchaseOrderHandler);
procurementRouter.get("/purchase-orders/:id", c.getPurchaseOrderHandler);
procurementRouter.post("/purchase-orders/:id/submit", requireTenantWritable, c.submitPurchaseOrderHandler);
procurementRouter.post(
  "/purchase-orders/:id/approve",
  requireTenantWritable,
  requirePermission("procurement.approve"),
  c.approvePurchaseOrderHandler,
);
procurementRouter.post(
  "/purchase-orders/:id/reject",
  requireTenantWritable,
  requirePermission("procurement.approve"),
  c.rejectPurchaseOrderHandler,
);
procurementRouter.post(
  "/purchase-orders/:id/close",
  requireTenantWritable,
  requirePermission("procurement.approve"),
  c.closePurchaseOrderHandler,
);
procurementRouter.post("/purchase-orders/:id/goods-receipts", requireTenantWritable, c.createGoodsReceiptHandler);
procurementRouter.get("/purchase-orders/:id/goods-receipts", c.listGoodsReceiptsHandler);

procurementRouter.get("/purchase-invoices", c.listPurchaseInvoicesHandler);
procurementRouter.post("/purchase-invoices", requireTenantWritable, c.createPurchaseInvoiceHandler);
procurementRouter.post(
  "/purchase-invoices/:id/payments",
  requireTenantWritable,
  c.recordSupplierPaymentHandler,
);
