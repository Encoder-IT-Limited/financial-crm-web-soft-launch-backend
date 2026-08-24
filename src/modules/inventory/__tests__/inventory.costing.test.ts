import { describe, it, expect } from "vitest";
import { weightedAverageCost } from "../inventory.costing";

describe("weightedAverageCost", () => {
  it("computes weighted average on a fresh balance", () => {
    const result = weightedAverageCost(0, 0, 10, 5);
    expect(result.newQty).toBe(10);
    expect(result.newAvgCost).toBe(5);
  });

  it("merges existing and incoming", () => {
    const result = weightedAverageCost(10, 5, 10, 10);
    expect(result.newQty).toBe(20);
    expect(result.newAvgCost).toBe(7.5);
  });

  it("returns zero cost when qty is zero", () => {
    const result = weightedAverageCost(0, 0, 0, 100);
    expect(result.newQty).toBe(0);
    expect(result.newAvgCost).toBe(0);
  });
});
