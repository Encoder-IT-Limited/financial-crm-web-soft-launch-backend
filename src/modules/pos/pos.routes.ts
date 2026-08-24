import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireTenantWritable } from "../../middlewares/requireTenantWritable";
import { requireRole } from "../../middlewares/requireRole";
import * as c from "./pos.controller";

export const posRouter: Router = Router();

posRouter.use(authenticate);

posRouter.get("/terminals", c.listTerminalsHandler);
posRouter.post("/terminals", requireTenantWritable, c.createTerminalHandler);

posRouter.post("/sessions", requireTenantWritable, c.openSessionHandler);
posRouter.get("/sessions", c.listSessionsHandler);
posRouter.post("/sessions/:id/close", requireTenantWritable, c.closeSessionHandler);

posRouter.get("/sales", c.listSalesHandler);
posRouter.post("/sales", requireTenantWritable, c.createSaleHandler);
posRouter.get("/sales/:id", c.getSaleHandler);
posRouter.post(
  "/sales/:id/refund",
  requireTenantWritable,
  requireRole("OWNER", "MANAGER"),
  c.refundSaleHandler,
);
posRouter.post("/sales/:id/void", requireTenantWritable, requireRole("OWNER", "MANAGER"), c.voidSaleHandler);
