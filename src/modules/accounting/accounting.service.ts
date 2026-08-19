import type { PrismaClient, Prisma } from "../../generated/tenant-client/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface AccountingEventInput {
  eventType: string;
  referenceType: string;
  referenceId: string;
  amount?: number;
  taxAmount?: number;
  currency?: string;
  payload: Record<string, unknown>;
}

// Phase 1 (docs/requirements-qa.md "Accounting Integration"): every
// financially-relevant transaction (POS, Invoice, Inventory) records a
// structured event here instead of a full double-entry journal entry. Full
// automatic journal generation is a later-phase transform over this table.
export function emitAccountingEvent(db: Db, tenantId: string, input: AccountingEventInput) {
  return db.accountingEvent.create({
    data: {
      tenantId,
      eventType: input.eventType,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      amount: input.amount,
      taxAmount: input.taxAmount,
      currency: input.currency,
      payload: input.payload as Prisma.InputJsonValue,
    },
  });
}
