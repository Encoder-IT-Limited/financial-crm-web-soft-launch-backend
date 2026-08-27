import type { PrismaClient } from "../../generated/tenant-client/client";
import { AppError } from "../../utils/errors";
import { resolveCurrency } from "../../utils/currency";
import { roundMoney } from "./invoicing.totals";

export type InvoiceSummaryMonth = {
  key: string;
  label: string;
  invoiced: number;
  collected: number;
};

export type InvoiceSummary = {
  months: InvoiceSummaryMonth[];
  totals: { invoiced: number; collected: number; outstanding: number };
};

export type StatementRow = {
  id: string;
  date: string;
  description: string;
  charge: number;
  credit: number;
  balance: number;
};

export type CustomerStatement = {
  customerId: string;
  customerName: string;
  customerCode: string;
  currency: string;
  openingBalance: number;
  closingBalance: number;
  rows: StatementRow[];
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK: "Bank Transfer",
  MOBILE_PAYMENT: "Mobile Payment",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

export function monthKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function lastNMonthBuckets(months: number, now = new Date()): { key: string; label: string }[] {
  const count = Math.min(24, Math.max(1, months));
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const buckets: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1));
    buckets.push({
      key: monthKeyUtc(d),
      label: d.toLocaleDateString("en", { month: "short", year: "2-digit", timeZone: "UTC" }),
    });
  }
  return buckets;
}

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

export type StatementEntry = {
  id: string;
  date: string;
  description: string;
  charge: number;
  credit: number;
};

export function withRunningBalance(rows: StatementEntry[], openingBalance: number): StatementRow[] {
  let balance = openingBalance;
  return rows.map((row) => {
    balance = roundMoney(balance + row.charge - row.credit);
    return { ...row, balance };
  });
}

function toNumber(value: { toString(): string } | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function toIso(date: Date): string {
  return date.toISOString();
}

export async function getInvoiceSummary(
  tenantPrisma: PrismaClient,
  months = 12,
  now = new Date(),
): Promise<InvoiceSummary> {
  const buckets = lastNMonthBuckets(months, now);
  const invoicedByMonth = new Map(buckets.map((b) => [b.key, 0]));
  const collectedByMonth = new Map(buckets.map((b) => [b.key, 0]));

  const invoices = await tenantPrisma.invoice.findMany({
    where: { status: { not: "CANCELLED" } },
    select: { id: true, invoiceDate: true, total: true, paidAmount: true, balanceDue: true },
  });

  let invoiced = 0;
  let collected = 0;
  let outstanding = 0;
  for (const invoice of invoices) {
    const total = toNumber(invoice.total);
    const paid = toNumber(invoice.paidAmount);
    invoiced += total;
    collected += paid;
    outstanding += toNumber(invoice.balanceDue);
    const key = monthKeyUtc(invoice.invoiceDate);
    if (invoicedByMonth.has(key)) {
      invoicedByMonth.set(key, (invoicedByMonth.get(key) ?? 0) + total);
    }
  }

  if (invoices.length > 0) {
    const payments = await tenantPrisma.payment.findMany({
      where: { referenceType: "INVOICE", referenceId: { in: invoices.map((i) => i.id) } },
      select: { paymentDate: true, amount: true },
    });
    for (const payment of payments) {
      const key = monthKeyUtc(payment.paymentDate);
      if (collectedByMonth.has(key)) {
        collectedByMonth.set(key, (collectedByMonth.get(key) ?? 0) + toNumber(payment.amount));
      }
    }
  }

  return {
    months: buckets.map((bucket) => ({
      ...bucket,
      invoiced: roundMoney(invoicedByMonth.get(bucket.key) ?? 0),
      collected: roundMoney(collectedByMonth.get(bucket.key) ?? 0),
    })),
    totals: {
      invoiced: roundMoney(invoiced),
      collected: roundMoney(collected),
      outstanding: roundMoney(outstanding),
    },
  };
}

export async function getCustomerStatement(
  tenantPrisma: PrismaClient,
  customerId: string,
  tenantCurrency?: string | null,
): Promise<CustomerStatement> {
  const customer = await tenantPrisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");

  const [invoices, creditNotes, debitNotes] = await Promise.all([
    tenantPrisma.invoice.findMany({
      where: { customerId, status: { not: "CANCELLED" } },
      select: { id: true, invoiceNumber: true, invoiceDate: true, total: true },
    }),
    tenantPrisma.creditNote.findMany({
      where: { customerId, status: { not: "VOID" } },
      select: { id: true, creditNoteNumber: true, createdAt: true, amount: true },
    }),
    tenantPrisma.debitNote.findMany({
      where: { customerId, status: { not: "VOID" } },
      select: { id: true, debitNoteNumber: true, createdAt: true, amount: true },
    }),
  ]);

  const invoiceNumberById = new Map(invoices.map((inv) => [inv.id, inv.invoiceNumber]));
  const payments =
    invoices.length === 0
      ? []
      : await tenantPrisma.payment.findMany({
          where: { referenceType: "INVOICE", referenceId: { in: invoices.map((i) => i.id) } },
          select: { id: true, referenceId: true, amount: true, paymentMethod: true, paymentDate: true },
        });

  const entries: StatementEntry[] = [];
  for (const invoice of invoices) {
    entries.push({
      id: `inv-${invoice.id}`,
      date: toIso(invoice.invoiceDate),
      description: `Invoice ${invoice.invoiceNumber}`,
      charge: toNumber(invoice.total),
      credit: 0,
    });
  }
  for (const payment of payments) {
    const invoiceNumber = invoiceNumberById.get(payment.referenceId) ?? "invoice";
    entries.push({
      id: `pay-${payment.id}`,
      date: toIso(payment.paymentDate),
      description: `Payment for ${invoiceNumber} (${paymentMethodLabel(payment.paymentMethod)})`,
      charge: 0,
      credit: toNumber(payment.amount),
    });
  }
  for (const note of creditNotes) {
    entries.push({
      id: `adj-${note.id}`,
      date: toIso(note.createdAt),
      description: `${note.creditNoteNumber} (Credit Note)`,
      charge: 0,
      credit: toNumber(note.amount),
    });
  }
  for (const note of debitNotes) {
    entries.push({
      id: `adj-${note.id}`,
      date: toIso(note.createdAt),
      description: `${note.debitNoteNumber} (Debit Note)`,
      charge: toNumber(note.amount),
      credit: 0,
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const openingBalance = toNumber(customer.openingBalance);
  const rows = withRunningBalance(entries, openingBalance);
  const closingBalance = rows.length > 0 ? rows[rows.length - 1]!.balance : openingBalance;

  return {
    customerId: customer.id,
    customerName: customer.name,
    customerCode: customer.customerCode,
    currency: resolveCurrency(tenantCurrency),
    openingBalance,
    closingBalance,
    rows,
  };
}
