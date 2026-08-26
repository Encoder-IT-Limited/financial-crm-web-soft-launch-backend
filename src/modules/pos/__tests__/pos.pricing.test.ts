import { describe, it, expect } from "vitest";
import { discountFromRule, taxFromRate, lineTotal } from "../pos.pricing";

describe("POS pricing", () => {
  it("applies a percentage rule without exceeding the line", () => {
    expect(discountFromRule("PERCENTAGE", 10, 2, 50)).toBe(10);
    expect(discountFromRule("PERCENTAGE", 100, 1, 25)).toBe(25);
    expect(discountFromRule("PERCENTAGE", 200, 1, 25)).toBe(25);
  });

  it("applies a fixed rule capped at the line subtotal", () => {
    expect(discountFromRule("FIXED", 5, 2, 10)).toBe(5);
    expect(discountFromRule("FIXED", 50, 1, 10)).toBe(10);
  });

  it("computes tax on the discounted net", () => {
    expect(taxFromRate(2, 50, 10, 10)).toBe(9);
    expect(taxFromRate(1, 100, 0, 0)).toBe(0);
  });

  it("computes line total", () => {
    expect(lineTotal(2, 50, 10, 9)).toBe(99);
  });
});
