import { Router } from "express";
import { authenticatePlatform } from "../../middleware/authenticate";
import { asyncHandler } from "../../core/http/asyncHandler";
import { planBodySchema } from "./plan.validators";
import * as plans from "./plan.service";

export const adminPlansRouter: Router = Router();
adminPlansRouter.use(authenticatePlatform);

adminPlansRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json((await plans.listPlans()).map(plans.toPlanDto));
  }),
);

adminPlansRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(plans.toPlanDto(await plans.getPlan(String(req.params.id))));
  }),
);

adminPlansRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = planBodySchema.parse(req.body);
    res.status(201).json(plans.toPlanDto(await plans.createPlan(input, req.user)));
  }),
);

adminPlansRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = planBodySchema.parse(req.body);
    res.json(plans.toPlanDto(await plans.updatePlan(String(req.params.id), input, req.user)));
  }),
);

adminPlansRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await plans.deletePlan(String(req.params.id), req.user);
    res.json({ deleted: true });
  }),
);
