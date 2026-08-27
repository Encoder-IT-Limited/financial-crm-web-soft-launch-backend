import { describe, it, expect } from "vitest";
import { saleListWhere, sessionListWhere } from "../pos.salesWhere";
import { salePaymentSchema, listSalesQuerySchema } from "../pos.validation";

describe("saleListWhere", () => {
  it("is empty with no filters", () => {
    expect(saleListWhere({})).toEqual({});
  });

  it("filters by customer and session", () => {
    expect(saleListWhere({ customerId: "c1", posSessionId: "s1" })).toEqual({
      AND: [{ posSessionId: "s1" }, { customerId: "c1" }],
    });
  });

  it("filters by terminal via matching session ids", () => {
    expect(saleListWhere({ matchingSessionIds: ["a", "b"] })).toEqual({
      posSessionId: { in: ["a", "b"] },
    });
  });

  it("searches transaction number", () => {
    expect(saleListWhere({ search: "POS-0001" })).toEqual({
      transactionNumber: { contains: "POS-0001", mode: "insensitive" },
    });
  });

  it("filters by date range", () => {
    const startDate = new Date("2026-08-01T00:00:00Z");
    const endDate = new Date("2026-08-31T23:59:59Z");
    expect(saleListWhere({ startDate, endDate })).toEqual({
      transactionDate: { gte: startDate, lte: endDate },
    });
  });
});

describe("sessionListWhere", () => {
  it("filters open sessions on a terminal", () => {
    expect(sessionListWhere({ status: "OPEN", terminalId: "t1" })).toEqual({
      AND: [{ status: "OPEN" }, { terminalId: "t1" }],
    });
  });
});

describe("salePaymentSchema", () => {
  it("accepts tenderedAmount at or above applied amount", () => {
    expect(salePaymentSchema.parse({ paymentMethod: "CASH", amount: 100, tenderedAmount: 150 })).toMatchObject({
      amount: 100,
      tenderedAmount: 150,
    });
  });

  it("rejects tenderedAmount below applied amount", () => {
    expect(() => salePaymentSchema.parse({ paymentMethod: "CASH", amount: 100, tenderedAmount: 80 })).toThrow();
  });
});

describe("listSalesQuerySchema", () => {
  it("parses terminal, customer, and dates", () => {
    const parsed = listSalesQuerySchema.parse({
      terminalId: "11111111-1111-4111-8111-111111111111",
      customerId: "22222222-2222-4222-8222-222222222222",
      startDate: "2026-08-01",
      search: "POS-1",
    });
    expect(parsed.terminalId).toBe("11111111-1111-4111-8111-111111111111");
    expect(parsed.search).toBe("POS-1");
    expect(parsed.startDate).toBeInstanceOf(Date);
  });
});
