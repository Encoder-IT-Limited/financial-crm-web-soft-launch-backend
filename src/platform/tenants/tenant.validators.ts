import { z } from "zod";

export const provisionTenantSchema = z.object({
  name: z.string().min(1),
  subdomain: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9-]+$/, "Subdomain may only contain lowercase letters, digits, and hyphens"),
  ownerName: z.string().min(1),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8),
});
