import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireTenantWritable } from "../../middlewares/requireTenantWritable";
import { requirePermission } from "../../middlewares/requirePermission";
import * as c from "./pos.controller";

export const posRouter: Router = Router();

posRouter.use(authenticate);

posRouter.get("/terminals", requirePermission("pos.view"), c.listTerminalsHandler);
posRouter.post("/terminals", requireTenantWritable, requirePermission("pos.manage"), c.createTerminalHandler);
posRouter.get("/terminals/:id/open-session", requirePermission("pos.view"), c.getOpenSessionForTerminalHandler);
posRouter.patch("/terminals/:id", requireTenantWritable, requirePermission("pos.manage"), c.updateTerminalHandler);
posRouter.delete("/terminals/:id", requireTenantWritable, requirePermission("pos.manage"), c.deleteTerminalHandler);
posRouter.post(
  "/terminals/:id/status",
  requireTenantWritable,
  requirePermission("pos.manage"),
  c.setTerminalStatusHandler,
);

posRouter.post("/sessions", requireTenantWritable, requirePermission("pos.createSale"), c.openSessionHandler);
posRouter.get("/sessions", requirePermission("pos.view"), c.listSessionsHandler);
posRouter.get("/sessions/:id", requirePermission("pos.view"), c.getSessionHandler);
posRouter.post("/sessions/:id/close", requireTenantWritable, requirePermission("pos.createSale"), c.closeSessionHandler);

posRouter.get("/discount-rules", requirePermission("pos.view"), c.listDiscountRulesHandler);
posRouter.post("/discount-rules", requireTenantWritable, requirePermission("pos.manage"), c.createDiscountRuleHandler);
posRouter.patch(
  "/discount-rules/:id",
  requireTenantWritable,
  requirePermission("pos.manage"),
  c.updateDiscountRuleHandler,
);

posRouter.post("/manager-pin", requireTenantWritable, requirePermission("pos.manage"), c.setManagerPinHandler);

posRouter.get("/lookup/barcode/:barcode", requirePermission("pos.view"), c.lookupBarcodeHandler);

posRouter.get("/sales", requirePermission("pos.view"), c.listSalesHandler);
posRouter.get("/sales/next-number", requirePermission("pos.view"), c.getNextSaleNumberHandler);
posRouter.post("/sales", requireTenantWritable, requirePermission("pos.createSale"), c.createSaleHandler);
posRouter.get("/sales/:id", requirePermission("pos.view"), c.getSaleHandler);
posRouter.get("/sales/:id/receipt", requirePermission("pos.view"), c.getReceiptHandler);
posRouter.post("/sales/:id/refund", requireTenantWritable, requirePermission("pos.refund"), c.refundSaleHandler);
posRouter.post("/sales/:id/void", requireTenantWritable, requirePermission("pos.refund"), c.voidSaleHandler);
posRouter.post("/sales/:id/exchange", requireTenantWritable, requirePermission("pos.refund"), c.exchangeSaleHandler);

posRouter.get("/sync-failures", requirePermission("pos.manage"), c.listSyncFailuresHandler);
posRouter.post("/sync-failures", requireTenantWritable, requirePermission("pos.createSale"), c.reportSyncFailureHandler);
posRouter.post(
  "/sync-failures/:id/retry",
  requireTenantWritable,
  requirePermission("pos.manage"),
  c.retrySyncFailureHandler,
);
posRouter.post(
  "/sync-failures/:id/resolve",
  requireTenantWritable,
  requirePermission("pos.manage"),
  c.resolveSyncFailureHandler,
);
