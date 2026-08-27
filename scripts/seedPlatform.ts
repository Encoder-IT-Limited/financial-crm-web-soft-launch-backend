import { publicPrisma } from "../src/db/publicPrisma";
import { env } from "../src/config/env";
import { hashPassword } from "../src/modules/auth/auth.service";
import { logger } from "../src/utils/logger";

const DEFAULT_PLANS = [
  {
    name: "Starter",
    priceMonthly: 199,
    priceYearly: 1910,
    baseSeats: 3,
    additionalSeatPrice: 39,
    trialDays: 14,
    minSeats: 3,
    maxSeats: 10,
    salesAssisted: false,
    modules: ["accounting", "sales", "purchasing", "banking"],
    popular: false,
  },
  {
    name: "Growth",
    priceMonthly: 499,
    priceYearly: 4790,
    baseSeats: 10,
    additionalSeatPrice: 29,
    trialDays: 14,
    minSeats: 10,
    maxSeats: 30,
    salesAssisted: false,
    modules: ["accounting", "sales", "purchasing", "inventory", "banking", "crm", "reports"],
    popular: true,
  },
  {
    name: "Enterprise",
    priceMonthly: 999,
    priceYearly: 9590,
    baseSeats: 25,
    additionalSeatPrice: 19,
    trialDays: 14,
    minSeats: 30,
    maxSeats: null,
    salesAssisted: true,
    modules: [
      "accounting",
      "sales",
      "purchasing",
      "inventory",
      "banking",
      "crm",
      "reports",
      "ai-assistant",
      "pos",
    ],
    popular: false,
  },
];

async function seed() {
  await publicPrisma.platformSettings.upsert({
    where: { id: "default" },
    create: { id: "default", platformName: "MRM Portal" },
    update: {},
  });

  for (const plan of DEFAULT_PLANS) {
    const existing = await publicPrisma.subscriptionPlan.findFirst({ where: { name: plan.name } });
    if (existing) continue;
    await publicPrisma.subscriptionPlan.create({ data: { ...plan, status: "ACTIVE" } });
    logger.info({ name: plan.name }, "Seeded plan");
  }

  const email = env.PLATFORM_ADMIN_EMAIL;
  const password = env.PLATFORM_ADMIN_PASSWORD;
  if (email && password) {
    const existing = await publicPrisma.platformUser.findUnique({ where: { email } });
    if (!existing) {
      await publicPrisma.platformUser.create({
        data: {
          email,
          name: env.PLATFORM_ADMIN_NAME ?? "MRM Super Admin",
          passwordHash: await hashPassword(password),
          status: "ACTIVE",
        },
      });
      logger.info({ email }, "Seeded platform admin");
    }
  } else {
    logger.warn("PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD not set — skipped admin user");
  }
}

seed()
  .then(() => publicPrisma.$disconnect())
  .catch(async (err) => {
    logger.error({ err }, "Platform seed failed");
    await publicPrisma.$disconnect();
    process.exit(1);
  });
