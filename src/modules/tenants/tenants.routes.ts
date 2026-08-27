import { Router } from "express";
import { authenticatePlatform } from "../../middlewares/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireParam } from "../../utils/params";
import { addSeatsSchema, provisionTenantSchema, removeSeatsSchema, updateTenantSchema } from "./tenants.validation";
import * as tenants from "./tenants.service";

export const adminTenantsRouter: Router = Router();
adminTenantsRouter.use(authenticatePlatform);

adminTenantsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await tenants.listTenants());
  }),
);

adminTenantsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = provisionTenantSchema.parse(req.body);
    const tenant = await tenants.provisionTenant(input);
    res.status(201).json(await tenants.getTenant(tenant.id));
  }),
);

adminTenantsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await tenants.getTenant(requireParam(req, "id")));
  }),
);

adminTenantsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = updateTenantSchema.parse(req.body);
    res.json(await tenants.updateTenant(requireParam(req, "id"), input, req.user));
  }),
);

adminTenantsRouter.post(
  "/:id/suspend",
  asyncHandler(async (req, res) => {
    res.json(await tenants.suspendTenant(requireParam(req, "id"), req.user));
  }),
);

adminTenantsRouter.post(
  "/:id/reactivate",
  asyncHandler(async (req, res) => {
    res.json(await tenants.reactivateTenant(requireParam(req, "id"), req.user));
  }),
);

adminTenantsRouter.post(
  "/:id/seats",
  asyncHandler(async (req, res) => {
    const { count } = addSeatsSchema.parse(req.body);
    res.json(await tenants.addSeats(requireParam(req, "id"), count, req.user));
  }),
);

adminTenantsRouter.post(
  "/:id/seats/remove",
  asyncHandler(async (req, res) => {
    const { count } = removeSeatsSchema.parse(req.body);
    res.json(await tenants.removeSeats(requireParam(req, "id"), count, req.user));
  }),
);

adminTenantsRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    res.json(await tenants.cancelTenant(requireParam(req, "id"), req.user));
  }),
);

adminTenantsRouter.post(
  "/:id/pending-deletion",
  asyncHandler(async (req, res) => {
    res.json(await tenants.markPendingDeletion(requireParam(req, "id"), req.user));
  }),
);
