import { Router } from "express";
import { authenticatePlatform } from "../../middlewares/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import { getDashboard } from "./dashboard.service";

export const adminDashboardRouter: Router = Router();
adminDashboardRouter.use(authenticatePlatform);

adminDashboardRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await getDashboard());
  }),
);
