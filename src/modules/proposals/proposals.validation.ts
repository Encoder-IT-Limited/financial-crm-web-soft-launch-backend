import { z } from "zod";
import { listPageQuerySchema } from "../invoicing/invoicing.validation";

export { listPageQuerySchema };

export const proposalItemSchema = z.object({
  productId: z.string().uuid().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  tax: z.number().nonnegative().default(0),
});

export const createProposalSchema = z.object({
  customerId: z.string().uuid(),
  proposalDate: z.coerce.date(),
  expiryDate: z.coerce.date(),
  notes: z.string().optional(),
  currency: z.string().min(3).max(8).optional(),
  items: z.array(proposalItemSchema).min(1),
  mode: z.enum(["draft", "send"]).optional(),
});

export const updateProposalSchema = z.object({
  customerId: z.string().uuid().optional(),
  proposalDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  notes: z.string().nullable().optional(),
  currency: z.string().min(3).max(8).optional(),
  items: z.array(proposalItemSchema).min(1),
});
