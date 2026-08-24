import { Router } from "express";
import { z } from "zod";
import { authenticatePlatform } from "../../middlewares/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import * as settings from "./settings.service";

export const adminSettingsRouter: Router = Router();
adminSettingsRouter.use(authenticatePlatform);

adminSettingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await settings.getSettings());
  }),
);

adminSettingsRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        platformName: z.string().min(1).optional(),
        primaryColor: z.string().nullable().optional(),
        retentionDays: z.number().int().min(30).max(90).optional(),
        seatLimitMessage: z.string().min(1).optional(),
        maintenanceMode: z.boolean().optional(),
        maintenanceMessage: z.string().nullable().optional(),
      })
      .parse(req.body);
    res.json(await settings.updateSettings(input));
  }),
);
