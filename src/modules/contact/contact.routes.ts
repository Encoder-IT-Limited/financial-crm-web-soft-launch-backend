import { Router } from "express";
import { z } from "zod";
import { publicPrisma } from "../../db/publicPrisma";
import { asyncHandler } from "../../utils/asyncHandler";

const createInquirySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  company: z.string().trim().max(160).optional(),
  message: z.string().trim().min(10).max(4000),
});

export const publicContactRouter: Router = Router();

publicContactRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createInquirySchema.parse(req.body);
    const row = await publicPrisma.contactInquiry.create({ data: input });
    res.status(201).json({ id: row.id, accepted: true });
  }),
);
