import { describe, it, expect } from "vitest";
import { invoiceListWhere } from "../invoicing.listWhere";

const now = new Date("2026-08-27T15:00:00");
const startOfToday = new Date("2026-08-27T00:00:00");

describe("invoiceListWhere", () => {
  it("returns an empty where when no filters are set", () => {
    expect(invoiceListWhere({})).toEqual({});
  });

  it("filters by customerId", () => {
    expect(invoiceListWhere({ customerId: "11111111-1111-1111-1111-111111111111" })).toEqual({
      customerId: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("searches invoice number and matching customer ids", () => {
    expect(
      invoiceListWhere({
        search: "INV-0001",
        matchingCustomerIds: ["c-1", "c-2"],
      }),
    ).toEqual({
      OR: [
        { invoiceNumber: { contains: "INV-0001", mode: "insensitive" } },
        { customerId: { in: ["c-1", "c-2"] } },
      ],
    });
  });

  it("searches invoice number alone when no customers match", () => {
    expect(invoiceListWhere({ search: "INV-0001", matchingCustomerIds: [] })).toEqual({
      OR: [{ invoiceNumber: { contains: "INV-0001", mode: "insensitive" } }],
    });
  });

  it("treats overdue as computed SENT/PARTIALLY_PAID past due with a balance", () => {
    expect(invoiceListWhere({ status: "overdue", now })).toEqual({
      status: { in: ["SENT", "PARTIALLY_PAID"] },
      dueDate: { lt: startOfToday },
      balanceDue: { gt: 0 },
    });
  });

  it("excludes overdue rows from the sent filter", () => {
    expect(invoiceListWhere({ status: "sent", now })).toEqual({
      status: "SENT",
      OR: [{ dueDate: { gte: startOfToday } }, { balanceDue: { lte: 0 } }],
    });
  });

  it("excludes overdue rows from the partially-paid filter", () => {
    expect(invoiceListWhere({ status: "partially-paid", now })).toEqual({
      status: "PARTIALLY_PAID",
      OR: [{ dueDate: { gte: startOfToday } }, { balanceDue: { lte: 0 } }],
    });
  });

  it("maps kebab-case paid/draft/cancelled to stored enums", () => {
    expect(invoiceListWhere({ status: "paid" })).toEqual({ status: "PAID" });
    expect(invoiceListWhere({ status: "draft" })).toEqual({ status: "DRAFT" });
    expect(invoiceListWhere({ status: "cancelled" })).toEqual({ status: "CANCELLED" });
  });

  it("ANDs status with customerId", () => {
    const where = invoiceListWhere({
      status: "paid",
      customerId: "11111111-1111-1111-1111-111111111111",
    });
    expect(where).toEqual({
      AND: [{ customerId: "11111111-1111-1111-1111-111111111111" }, { status: "PAID" }],
    });
  });
});
