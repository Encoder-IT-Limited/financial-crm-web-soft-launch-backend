import { listTenants } from "../tenants/tenants.service";
import { toPlanDto, listPlans } from "../plans/plans.service";
import { listPayments, toPaymentDto } from "../payments/payments.service";
import { listAudit, toAuditDto } from "../audit/audit.service";

export async function getDashboard() {
  const [tenants, plans, payments, audit] = await Promise.all([
    listTenants(),
    listPlans(),
    listPayments(),
    listAudit({}, { take: 200 }),
  ]);

  const activeTenants = tenants.filter((t) => t.status === "active");
  const atRisk = tenants.filter((t) => t.status === "read-only" || t.status === "pending-deletion");
  const mrr = activeTenants.reduce((sum, t) => {
    const plan = plans.find((p) => p.id === t.planId);
    if (!plan) return sum;
    const seats = t.seats.total;
    const extra = Math.max(0, seats - plan.baseSeats);
    const monthly = Number(plan.priceMonthly) + extra * Number(plan.additionalSeatPrice);
    return sum + (t.billingCycle === "yearly" ? monthly * 0.8 : monthly);
  }, 0);

  const now = Date.now();
  const newTenantsLast30Days = tenants.filter((t) => now - new Date(t.createdAt).getTime() <= 30 * 86_400_000).length;

  const trialsEndingSoon = tenants.flatMap((t) => {
    const plan = plans.find((p) => p.id === t.planId);
    if (!plan || plan.trialDays <= 0 || t.status !== "active") return [];
    const trialEnd = new Date(t.createdAt).getTime() + plan.trialDays * 86_400_000;
    const daysLeft = Math.ceil((trialEnd - now) / 86_400_000);
    if (daysLeft < 0 || daysLeft > 7) return [];
    return [{ id: t.id, name: t.name, planName: t.planName ?? plan.name, daysLeft }];
  });

  const planDistribution = plans.map((p) => ({
    planId: p.id,
    name: p.name,
    tenants: tenants.filter((t) => t.planId === p.id).length,
  }));

  return {
    kpis: {
      activeTenants: activeTenants.length,
      totalTenants: tenants.length,
      mrr: Math.round(mrr * 100) / 100,
      trialsEndingIn7Days: trialsEndingSoon.length,
      atRiskTenants: atRisk.length,
      newTenantsLast30Days,
    },
    planDistribution,
    trialsEndingSoon,
    atRiskTenants: atRisk.slice(0, 10),
    recentActivity: audit.slice(0, 8).map(toAuditDto),
    recentPayments: payments.slice(0, 5).map(toPaymentDto),
    plans: plans.map(toPlanDto),
  };
}
