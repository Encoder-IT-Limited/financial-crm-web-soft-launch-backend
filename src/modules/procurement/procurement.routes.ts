import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantWritable } from "../../middleware/requireTenantWritable";
import { requireRole } from "../../middleware/requireRole";
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
  requireRole("OWNER", "MANAGER"),
  c.approvePurchaseOrderHandler,
);
procurementRouter.post(
  "/purchase-orders/:id/reject",
  requireTenantWritable,
  requireRole("OWNER", "MANAGER"),
  c.rejectPurchaseOrderHandler,
);
procurementRouter.post(
  "/purchase-orders/:id/close",
  requireTenantWritable,
  requireRole("OWNER", "MANAGER"),
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
