import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireTenantWritable } from "../../middlewares/requireTenantWritable";
import { requirePermission } from "../../middlewares/requirePermission";
import * as c from "./retainers.controller";

export const retainersRouter: Router = Router();

retainersRouter.use(authenticate);

retainersRouter.get("/", c.listRetainersHandler);
retainersRouter.post("/", requireTenantWritable, c.createRetainerHandler);
retainersRouter.get("/:id", c.getRetainerHandler);
retainersRouter.patch("/:id", requireTenantWritable, c.updateRetainerHandler);
retainersRouter.post("/:id/status", requireTenantWritable, c.setRetainerStatusHandler);
retainersRouter.post("/:id/draw", requireTenantWritable, c.drawRetainerHandler);
retainersRouter.post("/:id/top-up", requireTenantWritable, c.topUpRetainerHandler);
retainersRouter.post("/:id/transfer", requireTenantWritable, c.transferRetainerHandler);
retainersRouter.post("/:id/roll-over", requireTenantWritable, c.rollOverRetainerHandler);
retainersRouter.post(
  "/:id/forfeit",
  requireTenantWritable,
  requirePermission("retainer.approve"),
  c.forfeitRetainerHandler,
);
retainersRouter.post(
  "/:id/refund",
  requireTenantWritable,
  requirePermission("retainer.approve"),
  c.refundRetainerHandler,
);
