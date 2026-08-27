import { Router } from "express";
import { z } from "zod";
import { authenticatePlatform } from "../../middlewares/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireParam } from "../../utils/params";
import * as payments from "./payments.service";

export const adminPaymentsRouter: Router = Router();
adminPaymentsRouter.use(authenticatePlatform);

adminPaymentsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await payments.listPayments();
    res.json(rows.map(payments.toPaymentDto));
  }),
);

adminPaymentsRouter.get(
  "/:id/invoice",
  asyncHandler(async (req, res) => {
    const row = await payments.getPayment(requireParam(req, "id"));
    const html = payments.paymentInvoiceHtml(payments.toPaymentDto(row));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${row.reference}.html"`);
    res.send(html);
  }),
);

adminPaymentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await payments.getPayment(requireParam(req, "id"));
    res.json(payments.toPaymentDto(row));
  }),
);

adminPaymentsRouter.post(
  "/:id/refund",
  asyncHandler(async (req, res) => {
    const row = await payments.updatePaymentStatus(requireParam(req, "id"), "refunded", req.user);
    res.json(payments.toPaymentDto(row));
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
