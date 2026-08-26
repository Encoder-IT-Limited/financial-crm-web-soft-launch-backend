import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../utils/errors";
import { requireParam } from "../../utils/params";
import { env } from "../../config/env";
import { ok } from "../../utils/envelope";
import { resolveCurrency, withCurrency } from "../../utils/currency";
import * as v from "./invoicing.validation";
import * as invoicingService from "./invoicing.service";

function ctx(req: Request) {
  if (!req.tenant || !req.tenantPrisma) throw new AppError(400, "TENANT_REQUIRED", "Tenant subdomain required");
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Not authenticated");
  return {
    tenantId: req.tenant.id,
    tenantPrisma: req.tenantPrisma,
    userId: req.user.id,
    currency: resolveCurrency(req.tenant.currency),
  };
}

function invoiceJson(req: Request, invoice: Parameters<typeof invoicingService.toInvoiceResponse>[0]) {
  return invoicingService.toInvoiceResponse(invoice, env.ROOT_DOMAIN, ctx(req).currency);
}

export async function listInvoicesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, currency } = ctx(req);
    const query = v.listPageQuerySchema.parse(req.query);
    const { items, meta } = await invoicingService.listInvoices(tenantPrisma, query);
    res.json(
      ok(
        items.map((i) => invoicingService.toInvoiceResponse(i, env.ROOT_DOMAIN, currency)),
        meta,
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function nextInvoiceNumberHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await invoicingService.peekNextInvoiceNumber(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function getInvoiceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const invoice = await invoicingService.getInvoice(tenantPrisma, requireParam(req, "id"));
    res.json(invoiceJson(req, invoice));
  } catch (err) {
    next(err);
  }
}

export async function createInvoiceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, currency } = ctx(req);
    const input = v.createInvoiceSchema.parse(req.body);
    const invoice = await invoicingService.createInvoice(tenantPrisma, tenantId, {
      ...input,
      currency: resolveCurrency(input.currency, currency),
    });
    res.status(201).json(invoiceJson(req, invoice));
  } catch (err) {
    next(err);
  }
}

export async function updateInvoiceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const input = v.updateInvoiceSchema.parse(req.body);
    const invoice = await invoicingService.updateInvoice(tenantPrisma, requireParam(req, "id"), input);
    res.json(invoiceJson(req, invoice));
  } catch (err) {
    next(err);
  }
}

export async function sendInvoiceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const invoice = await invoicingService.sendInvoice(tenantPrisma, requireParam(req, "id"));
    res.json(invoiceJson(req, invoice));
  } catch (err) {
    next(err);
  }
}

export async function recordPaymentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const input = v.recordPaymentSchema.parse(req.body);
    const result = await invoicingService.recordPayment(tenantPrisma, tenantId, requireParam(req, "id"), input, userId);
    res.status(201).json({
      payment: result.payment,
      invoice: invoiceJson(req, result.invoice),
    });
  } catch (err) {
    next(err);
  }
}

export async function fulfillInvoiceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const input = v.fulfillInvoiceSchema.parse(req.body);
    const result = await invoicingService.fulfillInvoice(
      tenantPrisma,
      tenantId,
      requireParam(req, "id"),
      input,
      userId,
    );
    res.json({
      invoice: invoiceJson(req, result.invoice),
      fulfillment: result.fulfillment,
    });
  } catch (err) {
    next(err);
  }
}

export async function listFulfillmentsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const invoiceId = typeof req.query.invoiceId === "string" ? req.query.invoiceId : undefined;
    res.json(await invoicingService.listFulfillments(tenantPrisma, invoiceId));
  } catch (err) {
    next(err);
  }
}

export async function listPendingReconciliationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await invoicingService.listPendingReconciliation(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function reconcileFulfillmentLineHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await invoicingService.reconcileFulfillmentLine(tenantPrisma, requireParam(req, "lineId")));
  } catch (err) {
    next(err);
  }
}

export async function cancelInvoiceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const invoice = await invoicingService.cancelInvoice(tenantPrisma, requireParam(req, "id"));
    res.json(invoiceJson(req, invoice));
  } catch (err) {
    next(err);
  }
}

export async function sendInvoiceReminderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const invoice = await invoicingService.sendInvoiceReminder(tenantPrisma, requireParam(req, "id"));
    res.json(invoiceJson(req, invoice));
  } catch (err) {
    next(err);
  }
}

export async function createCreditNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId, currency } = ctx(req);
    const input = v.createCreditNoteSchema.parse(req.body);
    const note = await invoicingService.createCreditNote(
      tenantPrisma,
      tenantId,
      { ...input, currency: resolveCurrency(input.currency, currency) },
      userId,
    );
    res.status(201).json(withCurrency(note, resolveCurrency(note.currency, currency)));
  } catch (err) {
    next(err);
  }
}

export async function listCreditNotesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, currency } = ctx(req);
    const query = v.listPageQuerySchema.parse(req.query);
    const { items, meta } = await invoicingService.listCreditNotes(tenantPrisma, query);
    res.json(ok(items.map((n) => withCurrency(n, resolveCurrency(n.currency, currency))), meta));
  } catch (err) {
    next(err);
  }
}

export async function nextCreditNoteNumberHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await invoicingService.peekNextCreditNoteNumber(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function voidCreditNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, currency } = ctx(req);
    const note = await invoicingService.voidCreditNote(tenantPrisma, requireParam(req, "id"));
    res.json(withCurrency(note, resolveCurrency(note.currency, currency)));
  } catch (err) {
    next(err);
  }
}

export async function createDebitNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, currency } = ctx(req);
    const input = v.createDebitNoteSchema.parse(req.body);
    const note = await invoicingService.createDebitNote(tenantPrisma, tenantId, {
      ...input,
      currency: resolveCurrency(input.currency, currency),
    });
    res.status(201).json(withCurrency(note, resolveCurrency(note.currency, currency)));
  } catch (err) {
    next(err);
  }
}

export async function listDebitNotesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, currency } = ctx(req);
    const query = v.listPageQuerySchema.parse(req.query);
    const { items, meta } = await invoicingService.listDebitNotes(tenantPrisma, query);
    res.json(ok(items.map((n) => withCurrency(n, resolveCurrency(n.currency, currency))), meta));
  } catch (err) {
    next(err);
  }
}

export async function nextDebitNoteNumberHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await invoicingService.peekNextDebitNoteNumber(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function voidDebitNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, currency } = ctx(req);
    const note = await invoicingService.voidDebitNote(tenantPrisma, requireParam(req, "id"));
    res.json(withCurrency(note, resolveCurrency(note.currency, currency)));
  } catch (err) {
    next(err);
  }
}

export async function convertCreditNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const invoice = await invoicingService.convertNoteToInvoice(
      tenantPrisma,
      tenantId,
      "credit",
      requireParam(req, "id"),
    );
    res.status(201).json(invoiceJson(req, invoice));
  } catch (err) {
    next(err);
  }
}

export async function convertDebitNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const invoice = await invoicingService.convertNoteToInvoice(
      tenantPrisma,
      tenantId,
      "debit",
      requireParam(req, "id"),
    );
    res.status(201).json(invoiceJson(req, invoice));
  } catch (err) {
    next(err);
  }
}

export async function createRecurringTemplateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, currency } = ctx(req);
    const input = v.createRecurringTemplateSchema.parse(req.body);
    const template = await invoicingService.createRecurringTemplate(tenantPrisma, tenantId, {
      ...input,
      currency: resolveCurrency(input.currency, currency),
    });
    res.status(201).json(withCurrency(template, resolveCurrency(template.currency, currency)));
  } catch (err) {
    next(err);
  }
}

export async function listRecurringTemplatesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, currency } = ctx(req);
    const query = v.listPageQuerySchema.parse(req.query);
    const { items, meta } = await invoicingService.listRecurringTemplates(tenantPrisma, query);
    res.json(ok(items.map((t) => withCurrency(t, resolveCurrency(t.currency, currency))), meta));
  } catch (err) {
    next(err);
  }
}

export async function generateRecurringTemplateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const invoice = await invoicingService.generateRecurringTemplate(
      tenantPrisma,
      tenantId,
      requireParam(req, "id"),
      userId,
    );
    res.status(201).json(invoiceJson(req, invoice));
  } catch (err) {
    next(err);
  }
}

export async function setRecurringTemplateStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, currency } = ctx(req);
    const input = v.updateRecurringTemplateStatusSchema.parse(req.body);
    const template = await invoicingService.setRecurringTemplateStatus(
      tenantPrisma,
      requireParam(req, "id"),
      input.status,
    );
    res.json(withCurrency(template, resolveCurrency(template.currency, currency)));
  } catch (err) {
    next(err);
  }
}

export async function updateRecurringTemplateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, currency } = ctx(req);
    const input = v.updateRecurringTemplateSchema.parse(req.body);
    const template = await invoicingService.updateRecurringTemplate(
      tenantPrisma,
      requireParam(req, "id"),
      input,
    );
    res.json(withCurrency(template, resolveCurrency(template.currency, currency)));
  } catch (err) {
    next(err);
  }
}

export async function deleteRecurringTemplateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await invoicingService.deleteRecurringTemplate(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}
