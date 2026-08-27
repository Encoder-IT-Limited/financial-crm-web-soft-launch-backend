import { describe, it, expect } from "vitest";
import {
  lastNMonthBuckets,
  monthKeyUtc,
  paymentMethodLabel,
  withRunningBalance,
} from "../invoicing.reports";

describe("invoicing.reports helpers", () => {
  it("builds 12 UTC month buckets ending at the given month", () => {
    const buckets = lastNMonthBuckets(12, new Date(Date.UTC(2026, 7, 27)));
    expect(buckets).toHaveLength(12);
    expect(buckets[0]?.key).toBe("2025-09");
    expect(buckets[11]?.key).toBe("2026-08");
    expect(buckets[11]?.label).toMatch(/Aug/);
  });

  it("monthKeyUtc uses the UTC calendar month", () => {
    expect(monthKeyUtc(new Date("2026-01-15T00:00:00.000Z"))).toBe("2026-01");
  });

  it("maps stored payment methods to the UI labels", () => {
    expect(paymentMethodLabel("BANK")).toBe("Bank Transfer");
    expect(paymentMethodLabel("CASH")).toBe("Cash");
    expect(paymentMethodLabel("UNKNOWN")).toBe("UNKNOWN");
  });

  it("computes running balance from opening + charge − credit", () => {
    const rows = withRunningBalance(
      [
        { id: "inv-1", date: "2026-01-01", description: "Invoice INV-1", charge: 100, credit: 0 },
        { id: "pay-1", date: "2026-01-05", description: "Payment", charge: 0, credit: 40 },
        { id: "adj-1", date: "2026-01-10", description: "CN-1 (Credit Note)", charge: 0, credit: 10 },
      ],
      25,
    );
    expect(rows.map((r) => r.balance)).toEqual([125, 85, 75]);
  });
});
