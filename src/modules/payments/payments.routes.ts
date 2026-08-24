import { Router } from "express";
import { z } from "zod";
import { authenticatePlatform } from "../../middlewares/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireParam } from "../../utils/params";
import * as payments from "./payment.service";

export const adminPaymentsRouter: Router = Router();
adminPaymentsRouter.use(authenticatePlatform);

adminPaymentsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await payments.listPayments();
    res.json(rows.map(payments.toPaymentDto));
  }),
);

adminPaymentsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(["paid", "failed", "pending", "refunded"]) }).parse(req.body);
    const row = await payments.updatePaymentStatus(requireParam(req, "id"), status, req.user);
    res.json(payments.toPaymentDto(row));
  }),
);
