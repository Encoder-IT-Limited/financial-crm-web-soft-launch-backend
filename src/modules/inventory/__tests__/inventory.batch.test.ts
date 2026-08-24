import { describe, it, expect } from "vitest";
import { generateBatchNumber } from "../inventory.batch";

describe("generateBatchNumber", () => {
  it("uses BAT-YYYYMMDD prefix", () => {
    const stamp = new Date(Date.UTC(2026, 7, 24, 12, 0, 0, 42));
    const value = generateBatchNumber(stamp);
    expect(value.startsWith("BAT-20260824-")).toBe(true);
    expect(value.length).toBeGreaterThan("BAT-20260824-".length);
  });
});
