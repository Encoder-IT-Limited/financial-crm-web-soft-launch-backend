import { describe, it, expect, vi } from "vitest";

vi.mock("../../../db/publicPrisma", () => ({
  publicPrisma: {},
}));

const { toPlanDto } = await import("../plans.service");

describe("plans.service – toPlanDto", () => {
  it("converts Decimal fields to numbers", () => {
    const dto = toPlanDto({
      id: "p1",
      name: "Growth",
      priceMonthly: "499.00" as unknown,
      priceYearly: "4790.00" as unknown,
      baseSeats: 10,
      additionalSeatPrice: "29.00" as unknown,
      trialDays: 14,
      modules: ["accounting", "sales"],
      popular: true,
      status: "ACTIVE",
    });
    expect(dto.priceMonthly).toBe(499);
    expect(dto.priceYearly).toBe(4790);
    expect(dto.additionalSeatPrice).toBe(29);
    expect(dto.popular).toBe(true);
  });
});
