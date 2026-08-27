import { Router } from "express";
import { z } from "zod";
import { authenticatePlatform } from "../../middlewares/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import * as settings from "./settings.service";

const nullableText = z.string().nullable().optional();

const updateSettingsSchema = z.object({
  platformName: z.string().min(1).optional(),
  primaryColor: nullableText,
  retentionDays: z.number().int().min(30).max(90).optional(),
  seatLimitMessage: z.string().min(1).optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: nullableText,
  tagline: nullableText,
  logoUrl: nullableText,
  contactEmail: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  currency: z.string().trim().min(3).max(8).optional(),
  privacyBody: nullableText,
  termsBody: nullableText,
  privacyLastUpdated: nullableText,
  termsLastUpdated: nullableText,
  linkedin: nullableText,
  twitter: nullableText,
  instagram: nullableText,
});

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
    const input = updateSettingsSchema.parse(req.body);
    const contactEmail = input.contactEmail === "" ? null : input.contactEmail;
    res.json(await settings.updateSettings({ ...input, contactEmail }));
  }),
);

export const publicSettingsRouter: Router = Router();
publicSettingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await settings.getPublicSettings());
  }),
);
