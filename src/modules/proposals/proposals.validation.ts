import { z } from "zod";

export const proposalItemSchema = z.object({
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
  items: z.array(proposalItemSchema).min(1),
  mode: z.enum(["draft", "send"]).optional(),
});

export const updateProposalSchema = z.object({
  customerId: z.string().uuid().optional(),
  proposalDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(proposalItemSchema).min(1),
});
