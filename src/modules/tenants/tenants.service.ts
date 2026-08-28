import type { Request } from "express";
import { publicPrisma } from "../../db/publicPrisma";
import { getTenantPrismaClient, TENANT_SCHEMA_NAME_RE } from "../../db/tenantClientCache";
import { migrateTenantSchema } from "../../db/migrateTenantSchema";
import { hashPassword } from "../auth/auth.service";
import { AppError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { toApiTenantStatus } from "../../utils/tenantStatus";
import { writeAudit } from "../audit/audit.service";
import { invalidateTenantCache } from "../../middlewares/tenantResolver";
import type { RequestTenant, RequestUser } from "../../types/express";
import { usedSeats as countUsedSeats } from "../../utils/seats";
import { seedSystemRoles, requireSystemRoleId } from "../users/roles.seed";

export interface ProvisionTenantInput {
  name: string;
  subdomain: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  legalName?: string;
  country?: string;
  planId?: string;
  billingCycle?: "monthly" | "yearly";
}

function schemaNameFor(subdomain: string): string {
  return `tenant_${subdomain.replace(/-/g, "_")}`;
}

export function slugifySubdomain(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function provisionTenant(input: ProvisionTenantInput) {
  const schemaName = schemaNameFor(input.subdomain);
  if (!TENANT_SCHEMA_NAME_RE.test(schemaName)) {
    throw new AppError(400, "INVALID_SUBDOMAIN", `Subdomain produces an invalid schema name: ${input.subdomain}`);
  }

  const existing = await publicPrisma.tenant.findFirst({
    where: { OR: [{ subdomain: input.subdomain }, { schemaName }] },
  });
  if (existing) {
    throw new AppError(409, "TENANT_ALREADY_EXISTS", `Subdomain "${input.subdomain}" is already taken`);
  }

  let plan = null;
  if (input.planId) {
    plan = await publicPrisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
    if (!plan) throw new AppError(404, "PLAN_NOT_FOUND", "Plan not found");
  }

  const tenant = await publicPrisma.tenant.create({
    data: {
      name: input.name,
      legalName: input.legalName,
      email: input.ownerEmail,
      country: input.country,
      subdomain: input.subdomain,
      schemaName,
      status: "PROVISIONING",
      lifecycle: "active",
      billingCycle: input.billingCycle ?? "monthly",
    },
  });

  try {
    await migrateTenantSchema(schemaName);

    const tenantPrisma = getTenantPrismaClient(schemaName);
    await seedSystemRoles(tenantPrisma, tenant.id);
    const ownerRole = await requireSystemRoleId(tenantPrisma, tenant.id, "OWNER");
    const passwordHash = await hashPassword(input.ownerPassword);
    await tenantPrisma.user.create({
      data: {
        tenantId: tenant.id,
        name: input.ownerName,
        email: input.ownerEmail,
        passwordHash,
        role: "OWNER",
        roleId: ownerRole.id,
      },
    });

    if (plan) {
      const start = new Date();
      const end = new Date(start);
      end.setDate(end.getDate() + plan.trialDays);
      await publicPrisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          startDate: start,
          endDate: end,
          status: "TRIAL",
        },
      });
    }

    return publicPrisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });
  } catch (err) {
    logger.error({ err, tenantId: tenant.id, schemaName }, "Tenant provisioning failed");
    await publicPrisma.tenant.update({ where: { id: tenant.id }, data: { status: "FAILED" } });
    throw err;
  }
}

export async function toTenantSummary(tenant: {
  id: string;
  name: string;
  legalName: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  subdomain: string;
  schemaName: string;
  status: string;
  lifecycle: string;
  extraSeats: number;
  billingCycle: string;
  pendingDeletionAt: Date | null;
  createdAt: Date;
}) {
  const subscription = await publicPrisma.subscription.findFirst({
    where: { tenantId: tenant.id },
    include: { plan: true },
    orderBy: { startDate: "desc" },
  });

  let users: {
    id: string;
    name: string;
    email: string;
    role: string;
    status?: string;
    assignedRole?: { countsTowardSeats: boolean } | null;
  }[] = [];
  try {
    const tenantPrisma = getTenantPrismaClient(tenant.schemaName);
    users = await tenantPrisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        assignedRole: { select: { countsTowardSeats: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  } catch {
    users = [];
  }

  const usedSeats = countUsedSeats(
    users.map((u) => ({
      status: u.status ?? "ACTIVE",
      countsTowardSeats: u.assignedRole?.countsTowardSeats ?? u.role !== "VIEWER",
    })),
  );
  const plan = subscription?.plan;
  const totalSeats = (plan?.baseSeats ?? 0) + tenant.extraSeats;

  return {
    id: tenant.id,
    name: tenant.name,
    legalName: tenant.legalName,
    email: tenant.email,
    phone: tenant.phone,
    address: tenant.address,
    subdomain: tenant.subdomain,
    planId: plan?.id ?? null,
    planName: plan?.name ?? null,
    status: toApiTenantStatus(tenant.lifecycle, tenant.status),
    billingCycle: tenant.billingCycle,
    extraSeatsPurchased: tenant.extraSeats,
    seats: { used: usedSeats, total: totalSeats },
    createdAt: tenant.createdAt.toISOString(),
    renewalDate: subscription?.endDate?.toISOString() ?? null,
    pendingDeletionAt: tenant.pendingDeletionAt?.toISOString() ?? null,
    modules: plan?.modules ?? [],
    users: users.map(({ id, name, email, role }) => ({ id, name, email, role })),
  };
}

export async function listTenants() {
  const tenants = await publicPrisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
  return Promise.all(tenants.map((t) => toTenantSummary(t)));
}

export async function getTenant(id: string) {
  const tenant = await publicPrisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found");

  return toTenantSummary(tenant);
}

export async function updateTenant(
  id: string,
  input: { name?: string; legalName?: string; email?: string; phone?: string; address?: string; planId?: string; billingCycle?: string },
  actor?: RequestUser,
) {
  const tenant = await publicPrisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found");

  const updated = await publicPrisma.tenant.update({
    where: { id },
    data: {
      name: input.name,
      legalName: input.legalName,
      email: input.email,
      phone: input.phone,
      address: input.address,
      billingCycle: input.billingCycle,
    },
  });

  if (input.planId) {
    const plan = await publicPrisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
    if (!plan) throw new AppError(404, "PLAN_NOT_FOUND", "Plan not found");
    const current = await publicPrisma.subscription.findFirst({
      where: { tenantId: id },
      orderBy: { startDate: "desc" },
    });
    if (current) {
      await publicPrisma.subscription.update({ where: { id: current.id }, data: { planId: plan.id } });
    } else {
      await publicPrisma.subscription.create({
        data: { tenantId: id, planId: plan.id, startDate: new Date(), status: "ACTIVE" },
      });
    }
  }

  invalidateTenantCache(tenant.subdomain);
  await writeAudit({
    actor,
    tenantId: tenant.id,
    tenantName: updated.name,
    module: "Tenants",
    entity: "Tenant",
    entityLabel: updated.name,
    action: "update",
    oldValues: { name: tenant.name, email: tenant.email },
    newValues: { name: updated.name, email: updated.email },
  });
  return getTenant(id);
}

export type OwnTenantProfileInput = {
  name?: string;
  legalName?: string | null;
  email?: string;
  phone?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  currency?: string | null;
};

export async function updateOwnTenantProfile(req: Request, input: OwnTenantProfileInput) {
  const current = req.tenant;
  if (!current) throw new AppError(400, "TENANT_REQUIRED", "This endpoint must be called on a tenant subdomain");

  const existing = await publicPrisma.tenant.findUnique({ where: { id: current.id } });
  if (!existing) throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found");

  const updated = await publicPrisma.tenant.update({
    where: { id: current.id },
    data: {
      name: input.name,
      legalName: input.legalName,
      email: input.email,
      phone: input.phone,
      address: input.address,
      taxNumber: input.taxNumber,
      currency: input.currency,
    },
  });

  invalidateTenantCache(existing.subdomain);
  const resolved: RequestTenant = {
    id: updated.id,
    name: updated.name,
    subdomain: updated.subdomain,
    schemaName: updated.schemaName,
    status: updated.status,
    lifecycle: updated.lifecycle,
    legalName: updated.legalName,
    email: updated.email,
    phone: updated.phone,
    address: updated.address,
    taxNumber: updated.taxNumber,
    currency: updated.currency,
  };
  req.tenant = resolved;

  await writeAudit({
    actor: req.user,
    tenantId: updated.id,
    tenantName: updated.name,
    module: "Settings",
    entity: "Tenant",
    entityLabel: updated.name,
    action: "update",
    oldValues: { name: existing.name, email: existing.email, taxNumber: existing.taxNumber },
    newValues: { name: updated.name, email: updated.email, taxNumber: updated.taxNumber },
  });
}

export async function suspendTenant(id: string, actor?: RequestUser) {
  const tenant = await publicPrisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found");
  await publicPrisma.tenant.update({
    where: { id },
    data: { status: "SUSPENDED", lifecycle: "read-only" },
  });
  invalidateTenantCache(tenant.subdomain);
  await writeAudit({
    actor,
    tenantId: tenant.id,
    tenantName: tenant.name,
    module: "Tenants",
    entity: "Tenant",
    entityLabel: tenant.name,
    action: "suspend",
    oldValues: { status: tenant.lifecycle },
    newValues: { status: "read-only" },
  });
  return getTenant(id);
}

export async function reactivateTenant(id: string, actor?: RequestUser) {
  const tenant = await publicPrisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found");
  await publicPrisma.tenant.update({
    where: { id },
    data: { status: "ACTIVE", lifecycle: "active", pendingDeletionAt: null },
  });
  invalidateTenantCache(tenant.subdomain);
  await writeAudit({
    actor,
    tenantId: tenant.id,
    tenantName: tenant.name,
    module: "Tenants",
    entity: "Tenant",
    entityLabel: tenant.name,
    action: "reactivate",
    oldValues: { status: tenant.lifecycle },
    newValues: { status: "active" },
  });
  return getTenant(id);
}

export async function addSeats(id: string, count: number, actor?: RequestUser) {
  if (count <= 0) throw new AppError(400, "INVALID_SEAT_COUNT", "Seat count must be positive");
  const tenant = await publicPrisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found");
  const extraSeats = tenant.extraSeats + count;
  await publicPrisma.tenant.update({ where: { id }, data: { extraSeats } });

  const subscription = await publicPrisma.subscription.findFirst({
    where: { tenantId: id },
    include: { plan: true },
    orderBy: { startDate: "desc" },
  });
  const amount = Number(subscription?.plan.additionalSeatPrice ?? 0) * count;
  await publicPrisma.platformPayment.create({
    data: {
      tenantId: id,
      reference: `SEATS-${Date.now()}`,
      planName: subscription?.plan.name ?? "unknown",
      type: "additional_seat",
      amount,
      method: "card",
      status: "paid",
    },
  });

  await writeAudit({
    actor,
    tenantId: tenant.id,
    tenantName: tenant.name,
    module: "Tenants",
    entity: "Tenant",
    entityLabel: tenant.name,
    action: "update",
    oldValues: { extraSeatsPurchased: tenant.extraSeats },
    newValues: { extraSeatsPurchased: extraSeats },
  });
  return getTenant(id);
}

export async function removeSeats(id: string, count: number, actor?: RequestUser) {
  if (count <= 0) throw new AppError(400, "INVALID_SEAT_COUNT", "Seat count must be positive");
  const tenant = await publicPrisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found");
  if (count > tenant.extraSeats) {
    throw new AppError(409, "SEAT_COUNT_TOO_LOW", `This tenant only has ${tenant.extraSeats} extra seats to remove`);
  }
  const extraSeats = tenant.extraSeats - count;
  await publicPrisma.tenant.update({ where: { id }, data: { extraSeats } });
  await writeAudit({
    actor,
    tenantId: tenant.id,
    tenantName: tenant.name,
    module: "Tenants",
    entity: "Tenant",
    entityLabel: tenant.name,
    action: "update",
    oldValues: { extraSeatsPurchased: tenant.extraSeats },
    newValues: { extraSeatsPurchased: extraSeats },
  });
  return getTenant(id);
}

export async function cancelTenant(id: string, actor?: RequestUser) {
  const tenant = await publicPrisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found");
  await publicPrisma.tenant.update({
    where: { id },
    data: { status: "SUSPENDED", lifecycle: "cancelled", pendingDeletionAt: null },
  });
  invalidateTenantCache(tenant.subdomain);
  await writeAudit({
    actor,
    tenantId: tenant.id,
    tenantName: tenant.name,
    module: "Tenants",
    entity: "Tenant",
    entityLabel: tenant.name,
    action: "update",
    oldValues: { status: tenant.lifecycle },
    newValues: { status: "cancelled" },
  });
  return getTenant(id);
}

export async function markPendingDeletion(id: string, actor?: RequestUser) {
  const settings = await publicPrisma.platformSettings.findUnique({ where: { id: "default" } });
  const days = settings?.retentionDays ?? 60;
  const tenant = await publicPrisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found");
  const pendingDeletionAt = new Date(Date.now() + days * 86_400_000);
  await publicPrisma.tenant.update({
    where: { id },
    data: { status: "SUSPENDED", lifecycle: "pending-deletion", pendingDeletionAt },
  });
  invalidateTenantCache(tenant.subdomain);
  await writeAudit({
    actor,
    tenantId: tenant.id,
    tenantName: tenant.name,
    module: "Tenants",
    entity: "Tenant",
    entityLabel: tenant.name,
    action: "delete",
    oldValues: { status: tenant.lifecycle },
    newValues: { status: "pending-deletion", pendingDeletionAt: pendingDeletionAt.toISOString() },
  });
  return getTenant(id);
}
