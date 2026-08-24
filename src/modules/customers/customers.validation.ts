import { z } from "zod";

export const createCustomerSchema = z.object({
  customerCode: z.string().min(1).optional(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxNumber: z.string().optional(),
  creditLimit: z.number().nonnegative().optional(),
  openingBalance: z.number().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  name: z.string().min(1).optional(),
});
