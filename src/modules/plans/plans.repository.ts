import { publicPrisma } from "../../db/publicPrisma";

export function listPlans(activeOnly = false) {
  return publicPrisma.subscriptionPlan.findMany({
    where: activeOnly ? { status: "ACTIVE" } : undefined,
    orderBy: { priceMonthly: "asc" },
  });
}

export function findPlan(id: string) {
  return publicPrisma.subscriptionPlan.findUnique({ where: { id } });
}

export function createPlan(data: {
  name: string;
  priceMonthly: number;
  priceYearly: number;
  baseSeats: number;
  additionalSeatPrice: number;
  trialDays: number;
  modules: string[];
  popular: boolean;
  status: string;
}) {
  return publicPrisma.subscriptionPlan.create({ data });
}

export function updatePlan(id: string, data: Record<string, unknown>) {
  return publicPrisma.subscriptionPlan.update({ where: { id }, data });
}

export function deletePlan(id: string) {
  return publicPrisma.subscriptionPlan.delete({ where: { id } });
}

export function countSubscriptionsForPlan(planId: string) {
  return publicPrisma.subscription.count({ where: { planId } });
}
