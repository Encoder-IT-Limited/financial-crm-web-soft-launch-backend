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
  legalName: z.string().optional(),
  country: z.string().optional(),
  planId: z.string().uuid().optional(),
  billingCycle: z.enum(["monthly", "yearly"]).optional(),
});

export const signupSchema = z.object({
  planId: z.string().uuid(),
  company: z.object({
    name: z.string().min(1),
    country: z.string().min(1),
  }),
  owner: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  legalName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  planId: z.string().uuid().optional(),
  billingCycle: z.enum(["monthly", "yearly"]).optional(),
});

/** Tenant-side org profile (no plan/billing changes). Empty strings become null; omitted keys stay undefined. */
const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null || value.trim() === "") return null;
    return value.trim();
  });

export const updateOwnTenantProfileSchema = z.object({
  name: z.string().trim().min(1).optional(),
  legalName: optionalText,
  email: z.string().trim().email().optional(),
  phone: optionalText,
  address: optionalText,
  taxNumber: optionalText,
  currency: optionalText,
});

export const addSeatsSchema = z.object({
  count: z.number().int().positive(),
});
