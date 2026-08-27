import { z } from "zod";

export const listPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const invoiceListStatusSchema = z.enum([
  "draft",
  "DRAFT",
  "sent",
  "SENT",
  "partially-paid",
  "PARTIALLY_PAID",
  "paid",
  "PAID",
  "cancelled",
  "CANCELLED",
  "overdue",
  "OVERDUE",
]);

const overdueQuerySchema = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true" || value === "1"));

export const listInvoicesQuerySchema = listPageQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  status: invoiceListStatusSchema.optional(),
  customerId: z.string().uuid().optional(),
  overdue: overdueQuerySchema,
});

export const invoiceSummaryQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).optional().default(12),
});

export const invoiceItemSchema = z.object({
  productId: z.string().uuid().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number(), // may be negative for credit-note-sourced invoices
  discount: z.number().nonnegative().default(0),
  tax: z.number().nonnegative().default(0),
});

export const createInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  dueDate: z.coerce.date(),
  items: z.array(invoiceItemSchema).min(1),
  source: z.string().optional(),
  currency: z.string().min(3).max(8).optional(),
});

export const updateInvoiceSchema = z.object({
  customerId: z.string().uuid().optional(),
  dueDate: z.coerce.date().optional(),
  items: z.array(invoiceItemSchema).min(1).optional(),
});

export const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(["CASH", "CARD", "BANK", "MOBILE_PAYMENT", "CHEQUE", "OTHER"]),
  transactionReference: z.string().optional(),
});

export const fulfillInvoiceSchema = z.object({
  warehouseId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        invoiceItemId: z.string().uuid(),
        quantity: z.number().positive(),
      }),
    )
    .optional(),
  generateDeliveryNote: z.boolean().optional().default(false),
  notes: z.string().optional(),
  trigger: z.enum(["MANUAL", "DELIVERY_NOTE", "POS_AUTO"]).optional(),
});

export const createCreditNoteSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional(),
  amount: z.number().positive(),
  reason: z.string().min(1),
  currency: z.string().min(3).max(8).optional(),
  linkedReturn: z.boolean().default(false),
  refundAmount: z.number().nonnegative().optional(),
  warehouseId: z.string().uuid().optional(),
  returnItems: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().positive() })).optional(),
});

export const createDebitNoteSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional(),
  amount: z.number().positive(),
  reason: z.string().min(1),
  currency: z.string().min(3).max(8).optional(),
});

export const createRecurringTemplateSchema = z.object({
  customerId: z.string().uuid(),
  frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  amount: z.number().positive(),
  description: z.string().min(1),
  autoSend: z.boolean().default(false),
  currency: z.string().min(3).max(8).optional(),
  kind: z.enum(["INVOICE", "RETAINER_TOPUP"]).optional().default("INVOICE"),
  retainerId: z.string().uuid().optional(),
});

export const updateRecurringTemplateSchema = z.object({
  customerId: z.string().uuid().optional(),
  frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]).optional(),
  startDate: z.coerce.date().optional(),
  nextInvoiceDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  amount: z.number().positive().optional(),
  description: z.string().min(1).optional(),
  autoSend: z.boolean().optional(),
});

export const updateRecurringTemplateStatusSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED"]),
});
