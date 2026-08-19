import { z } from "zod";

export const createCustomerSchema = z.object({
  customerCode: z.string().min(1).optional(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});
