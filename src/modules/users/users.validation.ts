import { z } from "zod";

export const listUsersQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "DISABLED", "INVITED"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export const createInviteSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  role: z.string().trim().min(1),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    role: z.string().trim().min(1).optional(),
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  })
  .refine((value) => value.name !== undefined || value.role !== undefined || value.status !== undefined, {
    message: "At least one of name, role, or status is required",
  });

export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional().nullable(),
  countsTowardSeats: z.boolean().optional(),
  permissions: z.array(z.string()).default([]),
});

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(240).optional().nullable(),
    countsTowardSeats: z.boolean().optional(),
    permissions: z.array(z.string()).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.countsTowardSeats !== undefined ||
      value.permissions !== undefined,
    { message: "At least one field is required" },
  );

export const acceptInviteSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8),
});

export const previewInviteQuerySchema = z.object({
  token: z.string().min(16),
});
