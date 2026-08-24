import { describe, it, expect } from "vitest";
import { computeInvoiceTotals, lineTotal, isOverdue, roundMoney, nextInvoiceStatus } from "../invoicing.totals";

describe("invoicing.totals", () => {
  it("computes totals for a single line", () => {
    const result = computeInvoiceTotals([
      { quantity: 2, unitPrice: 100, discount: 10, tax: 5 },
    ]);
    expect(result.subtotal).toBe(200);
    expect(result.discount).toBe(10);
    expect(result.tax).toBe(5);
    expect(result.total).toBe(195);
  });

  it("computes totals for multiple lines", () => {
    const result = computeInvoiceTotals([
      { quantity: 1, unitPrice: 50, discount: 0, tax: 2.5 },
      { quantity: 3, unitPrice: 10, discount: 5, tax: 1 },
    ]);
    expect(result.subtotal).toBe(80);
    expect(result.discount).toBe(5);
    expect(result.tax).toBe(3.5);
    expect(result.total).toBe(78.5);
  });

  it("lineTotal = qty * price - discount + tax", () => {
    expect(lineTotal({ quantity: 3, unitPrice: 10, discount: 2, tax: 1 })).toBe(29);
  });

  it("isOverdue returns true for past-due SENT invoice", () => {
    const pastDate = new Date(Date.now() - 86_400_000);
    expect(isOverdue({ status: "SENT", dueDate: pastDate })).toBe(true);
  });

  it("isOverdue returns false for DRAFT", () => {
    const pastDate = new Date(Date.now() - 86_400_000);
    expect(isOverdue({ status: "DRAFT", dueDate: pastDate })).toBe(false);
  });

  it("roundMoney rounds to 2 decimals", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(1.004)).toBe(1);
  });

  it("nextInvoiceStatus correctly determines status", () => {
    expect(nextInvoiceStatus(100, 100)).toBe("PAID");
    expect(nextInvoiceStatus(50, 100)).toBe("PARTIALLY_PAID");
    expect(nextInvoiceStatus(0, 100)).toBe("SENT");
  });
});
