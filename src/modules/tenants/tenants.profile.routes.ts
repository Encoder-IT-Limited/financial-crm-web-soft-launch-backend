import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireRole } from "../../middlewares/requireRole";
import { requireTenantWritable } from "../../middlewares/requireTenantWritable";
import { asyncHandler } from "../../utils/asyncHandler";
import { buildMe } from "../auth/me.service";
import { updateOwnTenantProfile } from "./tenants.service";
import { updateOwnTenantProfileSchema } from "./tenants.validation";

export const tenantProfileRouter: Router = Router();
tenantProfileRouter.use(authenticate);

tenantProfileRouter.patch(
  "/profile",
  requireTenantWritable,
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const input = updateOwnTenantProfileSchema.parse(req.body);
    await updateOwnTenantProfile(req, input);
    res.json(await buildMe(req));
  }),
);
