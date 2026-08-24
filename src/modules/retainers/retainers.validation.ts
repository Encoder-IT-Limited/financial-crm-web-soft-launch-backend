import { z } from "zod";

export const createRetainerSchema = z.object({
  customerId: z.string().uuid(),
  contractAmount: z.number().positive(),
  billingPeriod: z.string().min(1),
  billingModel: z.enum(["ONE_TIME", "RECURRING"]).default("ONE_TIME"),
  currency: z.string().min(1).default("AED"),
  startDate: z.coerce.date(),
  expiryDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  fundingInvoiceId: z.string().uuid().optional(),
});

export const updateRetainerSchema = z.object({
  billingPeriod: z.string().min(1).optional(),
  billingModel: z.enum(["ONE_TIME", "RECURRING"]).optional(),
  currency: z.string().min(1).optional(),
  startDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().nullable().optional(),
  notes: z.string().nullable().optional(),
  fundingInvoiceId: z.string().uuid().nullable().optional(),
});

export const setRetainerStatusSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "CLOSED"]),
});

export const drawRetainerSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive().optional(),
});

export const topUpRetainerSchema = z.object({
  amount: z.number().positive(),
  note: z.string().optional(),
  increaseContractAmount: z.boolean().default(true),
});

export const transferRetainerSchema = z.object({
  toRetainerId: z.string().uuid(),
});

export const rollOverRetainerSchema = z.object({
  expiryDate: z.coerce.date().optional(),
});

export const refundRetainerSchema = z.object({
  reason: z.string().min(1),
});
