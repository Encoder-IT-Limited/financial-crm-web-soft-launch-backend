import { Router } from "express";
import { authenticatePlatform } from "../../middlewares/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import { listAudit } from "./audit.service";

export const adminAuditRouter: Router = Router();
adminAuditRouter.use(authenticatePlatform);

adminAuditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await listAudit({
      tenantId: typeof req.query.tenantId === "string" ? req.query.tenantId : undefined,
      module: typeof req.query.module === "string" ? req.query.module : undefined,
      action: typeof req.query.action === "string" ? req.query.action : undefined,
    });
    res.json(
      rows.map((row) => ({
        id: row.id,
        timestamp: row.createdAt.toISOString(),
        userName: row.userName,
        userEmail: row.userEmail,
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        module: row.module,
        entity: row.entity,
        entityLabel: row.entityLabel,
        action: row.action,
        oldValues: row.oldValues,
        newValues: row.newValues,
        ipAddress: row.ipAddress,
      })),
    );
  }),
);
