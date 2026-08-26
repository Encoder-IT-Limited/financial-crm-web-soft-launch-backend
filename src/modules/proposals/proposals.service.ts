import type { PrismaClient } from "../../generated/tenant-client/client";
import { AppError } from "../../utils/errors";
import { formatDocumentNumber, peekNextNumber } from "../../utils/documentNumber";
import { parsePageQuery, pageMeta, isPagedQuery, type PageQuery } from "../../utils/pagination";
import { computeInvoiceTotals, lineTotal } from "../invoicing/invoicing.totals";
import { createInvoice } from "../invoicing/invoicing.service";

async function generateProposalNumber(tenantPrisma: PrismaClient): Promise<string> {
  const count = await tenantPrisma.proposal.count();
  return formatDocumentNumber("PRO", count);
}

export function peekNextProposalNumber(tenantPrisma: PrismaClient) {
  return peekNextNumber(() => tenantPrisma.proposal.count(), "PRO");
}

interface ProposalItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
}

interface CreateProposalInput {
  customerId: string;
  proposalDate: Date;
  expiryDate: Date;
  notes?: string;
  currency?: string;
  items: ProposalItemInput[];
}

export async function createProposal(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: CreateProposalInput,
  send = false,
) {
  const customer = await tenantPrisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");

  const totals = computeInvoiceTotals(input.items);
  const proposalNumber = await generateProposalNumber(tenantPrisma);

  const proposal = await tenantPrisma.proposal.create({
    data: {
      tenantId,
      customerId: input.customerId,
      proposalNumber,
      proposalDate: input.proposalDate,
      expiryDate: input.expiryDate,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      notes: input.notes,
      currency: input.currency,
      status: send ? "SENT" : "DRAFT",
      sentAt: send ? new Date() : null,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          tax: item.tax,
          total: lineTotal(item),
        })),
      },
    },
    include: { items: true },
  });

  return proposal;
}

export async function listProposals(tenantPrisma: PrismaClient, query: PageQuery = {}) {
  const { page, pageSize, skip } = parsePageQuery(query);
  const paginate = isPagedQuery(query);
  const [total, items] = await Promise.all([
    tenantPrisma.proposal.count(),
    tenantPrisma.proposal.findMany({
      include: { items: true },
      orderBy: { createdAt: "desc" },
      ...(paginate ? { skip, take: pageSize } : {}),
    }),
  ]);
  return { items, meta: pageMeta(total, paginate ? page : 1, paginate ? pageSize : total) };
}

export async function getProposal(tenantPrisma: PrismaClient, id: string) {
  const proposal = await tenantPrisma.proposal.findUnique({ where: { id }, include: { items: true } });
  if (!proposal) throw new AppError(404, "PROPOSAL_NOT_FOUND", "Proposal not found");
  return proposal;
}

interface UpdateProposalInput {
  customerId?: string;
  proposalDate?: Date;
  expiryDate?: Date;
  notes?: string | null;
  currency?: string;
  items: ProposalItemInput[];
}

export async function updateProposal(tenantPrisma: PrismaClient, id: string, input: UpdateProposalInput) {
  const existing = await getProposal(tenantPrisma, id);
  if (existing.status !== "DRAFT") {
    throw new AppError(409, "INVALID_PROPOSAL_STATE", `Proposal is ${existing.status}, expected DRAFT`);
  }

  if (input.customerId) {
    const customer = await tenantPrisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");
  }

  const totals = computeInvoiceTotals(input.items);

  return tenantPrisma.$transaction(async (tx) => {
    await tx.proposalItem.deleteMany({ where: { proposalId: id } });
    return tx.proposal.update({
      where: { id },
      data: {
        customerId: input.customerId,
        proposalDate: input.proposalDate,
        expiryDate: input.expiryDate,
        notes: input.notes,
        currency: input.currency,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            tax: item.tax,
            total: lineTotal(item),
          })),
        },
      },
      include: { items: true },
    });
  });
}

export async function sendProposal(tenantPrisma: PrismaClient, id: string) {
  const proposal = await getProposal(tenantPrisma, id);
  if (proposal.status !== "DRAFT") {
    throw new AppError(409, "INVALID_PROPOSAL_STATE", `Proposal is ${proposal.status}, expected DRAFT`);
  }
  return tenantPrisma.proposal.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date() },
    include: { items: true },
  });
}

export async function rejectProposal(tenantPrisma: PrismaClient, id: string) {
  const proposal = await getProposal(tenantPrisma, id);
  if (proposal.status !== "SENT") {
    throw new AppError(409, "INVALID_PROPOSAL_STATE", `Proposal is ${proposal.status}, expected SENT`);
  }
  return tenantPrisma.proposal.update({
    where: { id },
    data: { status: "REJECTED", respondedAt: new Date() },
    include: { items: true },
  });
}

export async function convertProposal(tenantPrisma: PrismaClient, tenantId: string, id: string) {
  const proposal = await getProposal(tenantPrisma, id);
  if (proposal.status !== "SENT") {
    throw new AppError(409, "INVALID_PROPOSAL_STATE", `Proposal is ${proposal.status}, expected SENT`);
  }
  if (proposal.convertedInvoiceId) {
    throw new AppError(409, "ALREADY_CONVERTED", "Proposal has already been converted to an invoice");
  }

  const invoice = await createInvoice(tenantPrisma, tenantId, {
    customerId: proposal.customerId,
    dueDate: proposal.expiryDate,
    source: "ESTIMATE",
    currency: proposal.currency ?? undefined,
    items: proposal.items.map((item) => ({
      productId: item.productId ?? undefined,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount),
      tax: Number(item.tax),
    })),
  });

  const updated = await tenantPrisma.proposal.update({
    where: { id },
    data: {
      status: "ACCEPTED",
      respondedAt: new Date(),
      convertedInvoiceId: invoice.id,
    },
    include: { items: true },
  });

  return { proposal: updated, invoice };
}
