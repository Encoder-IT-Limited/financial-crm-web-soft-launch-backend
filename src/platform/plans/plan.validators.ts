import { z } from "zod";
import { MODULE_KEYS } from "../../core/identity/moduleKeys";

export const planBodySchema = z.object({
  name: z.string().min(1),
  priceMonthly: z.number().nonnegative(),
  priceYearly: z.number().nonnegative(),
  baseSeats: z.number().int().positive(),
  additionalSeatPrice: z.number().nonnegative(),
  trialDays: z.number().int().nonnegative().default(14),
  modules: z.array(z.enum(MODULE_KEYS)).min(1),
  popular: z.boolean().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
