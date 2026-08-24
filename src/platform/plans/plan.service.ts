import { publicPrisma } from "../../db/publicPrisma";
import { AppError } from "../../common/errors";
import { writeAudit } from "../audit/audit.service";
import type { RequestUser } from "../../common/types/express";

export function toPlanDto(plan: {
  id: string;
  name: string;
  priceMonthly: unknown;
  priceYearly: unknown;
  baseSeats: number;
  additionalSeatPrice: unknown;
  trialDays: number;
  modules: string[];
  popular: boolean;
  status: string;
}) {
  return {
    id: plan.id,
    name: plan.name,
    priceMonthly: Number(plan.priceMonthly),
    priceYearly: Number(plan.priceYearly),
    baseSeats: plan.baseSeats,
    additionalSeatPrice: Number(plan.additionalSeatPrice),
    trialDays: plan.trialDays,
    modules: plan.modules,
    popular: plan.popular,
    status: plan.status,
  };
}

export function listPlans(activeOnly = false) {
  return publicPrisma.subscriptionPlan.findMany({
    where: activeOnly ? { status: "ACTIVE" } : undefined,
    orderBy: { priceMonthly: "asc" },
  });
}

export async function getPlan(id: string) {
  const plan = await publicPrisma.subscriptionPlan.findUnique({ where: { id } });
  if (!plan) throw new AppError(404, "PLAN_NOT_FOUND", "Plan not found");
  return plan;
}

export async function createPlan(
  input: {
    name: string;
    priceMonthly: number;
    priceYearly: number;
    baseSeats: number;
    additionalSeatPrice: number;
    trialDays: number;
    modules: string[];
    popular?: boolean;
    status?: string;
  },
  actor?: RequestUser,
) {
  const plan = await publicPrisma.subscriptionPlan.create({
    data: {
      name: input.name,
      priceMonthly: input.priceMonthly,
      priceYearly: input.priceYearly,
      baseSeats: input.baseSeats,
      additionalSeatPrice: input.additionalSeatPrice,
      trialDays: input.trialDays,
      modules: input.modules,
      popular: input.popular ?? false,
      status: input.status ?? "ACTIVE",
    },
  });
  await writeAudit({
    actor,
    module: "Plans & Pricing",
    entity: "Plan",
    entityLabel: plan.name,
    action: "create",
    newValues: { priceMonthly: input.priceMonthly, baseSeats: input.baseSeats },
  });
  return plan;
}

export async function updatePlan(id: string, input: Parameters<typeof createPlan>[0], actor?: RequestUser) {
  const existing = await getPlan(id);
  const plan = await publicPrisma.subscriptionPlan.update({
    where: { id },
    data: {
      name: input.name,
      priceMonthly: input.priceMonthly,
      priceYearly: input.priceYearly,
      baseSeats: input.baseSeats,
      additionalSeatPrice: input.additionalSeatPrice,
      trialDays: input.trialDays,
      modules: input.modules,
      popular: input.popular ?? existing.popular,
      status: input.status ?? existing.status,
    },
  });
  await writeAudit({
    actor,
    module: "Plans & Pricing",
    entity: "Plan",
    entityLabel: plan.name,
    action: "update",
    oldValues: { name: existing.name, baseSeats: existing.baseSeats },
    newValues: { name: plan.name, baseSeats: plan.baseSeats },
  });
  return plan;
}

export async function deletePlan(id: string, actor?: RequestUser) {
  const existing = await getPlan(id);
  const inUse = await publicPrisma.subscription.count({ where: { planId: id } });
  if (inUse > 0) {
    throw new AppError(409, "PLAN_IN_USE", "Cannot delete a plan that has active subscriptions");
  }
  await publicPrisma.subscriptionPlan.delete({ where: { id } });
  await writeAudit({
    actor,
    module: "Plans & Pricing",
    entity: "Plan",
    entityLabel: existing.name,
    action: "delete",
    oldValues: { name: existing.name },
  });
}
