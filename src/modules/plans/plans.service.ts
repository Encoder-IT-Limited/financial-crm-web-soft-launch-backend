import { AppError } from "../../utils/errors";
import { writeAudit } from "../audit/audit.service";
import type { RequestUser } from "../../types/express";
import type { PlanDto } from "./plans.dto";
import * as plansRepository from "./plans.repository";

export function toPlanDto(plan: {
  id: string;
  name: string;
  priceMonthly: unknown;
  priceYearly: unknown;
  baseSeats: number;
  additionalSeatPrice: unknown;
  trialDays: number;
  minSeats?: number | null;
  maxSeats?: number | null;
  salesAssisted?: boolean;
  modules: string[];
  popular: boolean;
  status: string;
}): PlanDto {
  const minSeats = plan.minSeats ?? plan.baseSeats;
  return {
    id: plan.id,
    name: plan.name,
    priceMonthly: Number(plan.priceMonthly),
    priceYearly: Number(plan.priceYearly),
    baseSeats: plan.baseSeats,
    additionalSeatPrice: Number(plan.additionalSeatPrice),
    trialDays: plan.trialDays,
    minSeats,
    maxSeats: plan.maxSeats ?? null,
    salesAssisted: Boolean(plan.salesAssisted),
    modules: plan.modules,
    popular: plan.popular,
    status: plan.status,
  };
}

export function listPlans(activeOnly = false) {
  return plansRepository.listPlans(activeOnly);
}

export async function getPlan(id: string) {
  const plan = await plansRepository.findPlan(id);
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
    minSeats?: number;
    maxSeats?: number | null;
    salesAssisted?: boolean;
  },
  actor?: RequestUser,
) {
  const plan = await plansRepository.createPlan({
    name: input.name,
    priceMonthly: input.priceMonthly,
    priceYearly: input.priceYearly,
    baseSeats: input.baseSeats,
    additionalSeatPrice: input.additionalSeatPrice,
    trialDays: input.trialDays,
    modules: input.modules,
    popular: input.popular ?? false,
    status: input.status ?? "ACTIVE",
    minSeats: input.minSeats ?? input.baseSeats,
    maxSeats: input.maxSeats ?? null,
    salesAssisted: input.salesAssisted ?? false,
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
  const plan = await plansRepository.updatePlan(id, {
    name: input.name,
    priceMonthly: input.priceMonthly,
    priceYearly: input.priceYearly,
    baseSeats: input.baseSeats,
    additionalSeatPrice: input.additionalSeatPrice,
    trialDays: input.trialDays,
    modules: input.modules,
    popular: input.popular ?? existing.popular,
    status: input.status ?? existing.status,
    minSeats: input.minSeats ?? existing.minSeats ?? existing.baseSeats,
    maxSeats: input.maxSeats === undefined ? existing.maxSeats : input.maxSeats,
    salesAssisted: input.salesAssisted ?? existing.salesAssisted,
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
  const inUse = await plansRepository.countSubscriptionsForPlan(id);
  if (inUse > 0) {
    throw new AppError(409, "PLAN_IN_USE", "Cannot delete a plan that has active subscriptions");
  }
  await plansRepository.deletePlan(id);
  await writeAudit({
    actor,
    module: "Plans & Pricing",
    entity: "Plan",
    entityLabel: existing.name,
    action: "delete",
    oldValues: { name: existing.name },
  });
}
