import { Router } from "express";
import { z } from "zod";
import { authenticatePlatform } from "../../middlewares/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/envelope";
import { isPagedQuery, listAudit, listAuditPage, toAuditDto } from "./audit.service";

const listQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  module: z.string().trim().optional(),
  action: z.string().trim().optional(),
  q: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const adminAuditRouter: Router = Router();
adminAuditRouter.use(authenticatePlatform);

adminAuditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(
      Object.fromEntries(Object.entries(req.query).filter(([, value]) => value !== "" && value !== undefined)),
    );
    const filters = {
      tenantId: query.tenantId,
      module: query.module,
      action: query.action,
      q: query.q,
      from: query.from,
      to: query.to,
    };
    if (isPagedQuery(query)) {
      const { items, meta } = await listAuditPage(filters, query);
      res.json(ok(items.map(toAuditDto), meta));
      return;
    }
    const rows = await listAudit(filters);
    res.json(rows.map(toAuditDto));
  }),
);
