import { z } from "zod";

export const invoiceItemSchema = z.object({
  productId: z.string().uuid().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  tax: z.number().nonnegative().default(0),
});

export const createInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  dueDate: z.coerce.date(),
  items: z.array(invoiceItemSchema).min(1),
});

export const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(["CASH", "CARD", "BANK", "MOBILE_PAYMENT", "CHEQUE", "OTHER"]),
  transactionReference: z.string().optional(),
});

export const fulfillInvoiceSchema = z.object({
  warehouseId: z.string().uuid(),
});

export const createCreditNoteSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional(),
  amount: z.number().positive(),
  reason: z.string().min(1),
  linkedReturn: z.boolean().default(false),
  refundAmount: z.number().nonnegative().optional(),
  warehouseId: z.string().uuid().optional(),
  returnItems: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().positive() })).optional(),
});

export const createRecurringTemplateSchema = z.object({
  customerId: z.string().uuid(),
  frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  amount: z.number().positive(),
  description: z.string().min(1),
  autoSend: z.boolean().default(false),
});
