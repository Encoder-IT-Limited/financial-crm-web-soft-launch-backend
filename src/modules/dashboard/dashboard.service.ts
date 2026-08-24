import { listTenants } from "../tenants/tenants.service";
import { toPlanDto, listPlans } from "../plans/plans.service";
import { listPayments, toPaymentDto } from "../payments/payments.service";
import { listAudit } from "../audit/audit.service";

export async function getDashboard() {
  const [tenants, plans, payments, audit] = await Promise.all([
    listTenants(),
    listPlans(),
    listPayments(),
    listAudit({}),
  ]);

  const active = tenants.filter((t) => t.status === "active").length;
  const atRisk = tenants.filter((t) => t.status === "read-only" || t.status === "pending-deletion");
  const mrr = tenants.reduce((sum, t) => {
    const plan = plans.find((p) => p.id === t.planId);
    if (!plan) return sum;
    const seats = t.seats.total;
    const extra = Math.max(0, seats - plan.baseSeats);
    const monthly = Number(plan.priceMonthly) + extra * Number(plan.additionalSeatPrice);
    return sum + (t.billingCycle === "yearly" ? monthly * 0.8 : monthly);
  }, 0);

  const now = Date.now();
  const trialsEnding = tenants.filter((t) => {
    if (!t.renewalDate) return false;
    const ms = new Date(t.renewalDate).getTime() - now;
    return ms > 0 && ms <= 7 * 86_400_000;
  }).length;

  const planDistribution = plans.map((p) => ({
    planId: p.id,
    name: p.name,
    tenants: tenants.filter((t) => t.planId === p.id).length,
  }));

  return {
    kpis: {
      activeTenants: active,
      totalTenants: tenants.length,
      mrr: Math.round(mrr * 100) / 100,
      trialsEndingIn7Days: trialsEnding,
      atRiskTenants: atRisk.length,
    },
    planDistribution,
    atRiskTenants: atRisk.slice(0, 10),
    recentActivity: audit.slice(0, 8),
    recentPayments: payments.slice(0, 5).map(toPaymentDto),
    plans: plans.map(toPlanDto),
  };
}
