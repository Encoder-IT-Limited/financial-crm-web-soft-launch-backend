import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../utils/errors";
import { requireParam } from "../../utils/params";
import { env } from "../../config/env";
import * as v from "./invoicing.validation";
import * as invoicingService from "./invoicing.service";

function ctx(req: Request) {
  if (!req.tenant || !req.tenantPrisma) throw new AppError(400, "TENANT_REQUIRED", "Tenant subdomain required");
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Not authenticated");
  return { tenantId: req.tenant.id, tenantPrisma: req.tenantPrisma, userId: req.user.id };
}

export async function listInvoicesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const invoices = await invoicingService.listInvoices(tenantPrisma);
    res.json(invoices.map((i) => invoicingService.toInvoiceResponse(i, env.ROOT_DOMAIN)));
  } catch (err) {
    next(err);
  }
}

export async function getInvoiceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const invoice = await invoicingService.getInvoice(tenantPrisma, requireParam(req, "id"));
    res.json(invoicingService.toInvoiceResponse(invoice, env.ROOT_DOMAIN));
  } catch (err) {
    next(err);
  }
}

export async function createInvoiceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const input = v.createInvoiceSchema.parse(req.body);
    const invoice = await invoicingService.createInvoice(tenantPrisma, tenantId, input);
    res.status(201).json(invoicingService.toInvoiceResponse(invoice, env.ROOT_DOMAIN));
  } catch (err) {
    next(err);
  }
}

export async function updateInvoiceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const input = v.updateInvoiceSchema.parse(req.body);
    const invoice = await invoicingService.updateInvoice(tenantPrisma, requireParam(req, "id"), input);
    res.json(invoicingService.toInvoiceResponse(invoice, env.ROOT_DOMAIN));
  } catch (err) {
    next(err);
  }
}

export async function sendInvoiceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const invoice = await invoicingService.sendInvoice(tenantPrisma, requireParam(req, "id"));
    res.json(invoicingService.toInvoiceResponse(invoice, env.ROOT_DOMAIN));
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
      invoice: invoicingService.toInvoiceResponse(result.invoice, env.ROOT_DOMAIN),
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
      invoice: invoicingService.toInvoiceResponse(result.invoice, env.ROOT_DOMAIN),
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
    res.json(invoicingService.toInvoiceResponse(invoice, env.ROOT_DOMAIN));
  } catch (err) {
    next(err);
  }
}

export async function sendInvoiceReminderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const invoice = await invoicingService.sendInvoiceReminder(tenantPrisma, requireParam(req, "id"));
    res.json(invoicingService.toInvoiceResponse(invoice, env.ROOT_DOMAIN));
  } catch (err) {
    next(err);
  }
}

export async function createCreditNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const input = v.createCreditNoteSchema.parse(req.body);
    res.status(201).json(await invoicingService.createCreditNote(tenantPrisma, tenantId, input, userId));
  } catch (err) {
    next(err);
  }
}

export async function listCreditNotesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await invoicingService.listCreditNotes(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function voidCreditNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await invoicingService.voidCreditNote(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function createDebitNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const input = v.createDebitNoteSchema.parse(req.body);
    res.status(201).json(await invoicingService.createDebitNote(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function listDebitNotesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await invoicingService.listDebitNotes(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function voidDebitNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await invoicingService.voidDebitNote(tenantPrisma, requireParam(req, "id")));
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
    res.status(201).json(invoicingService.toInvoiceResponse(invoice, env.ROOT_DOMAIN));
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
    res.status(201).json(invoicingService.toInvoiceResponse(invoice, env.ROOT_DOMAIN));
  } catch (err) {
    next(err);
  }
}

export async function createRecurringTemplateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const input = v.createRecurringTemplateSchema.parse(req.body);
    res.status(201).json(await invoicingService.createRecurringTemplate(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function listRecurringTemplatesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await invoicingService.listRecurringTemplates(tenantPrisma));
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
    res.status(201).json(invoicingService.toInvoiceResponse(invoice, env.ROOT_DOMAIN));
  } catch (err) {
    next(err);
  }
}

export async function setRecurringTemplateStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const input = v.updateRecurringTemplateStatusSchema.parse(req.body);
    res.json(await invoicingService.setRecurringTemplateStatus(tenantPrisma, requireParam(req, "id"), input.status));
  } catch (err) {
    next(err);
  }
}

export async function updateRecurringTemplateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const input = v.updateRecurringTemplateSchema.parse(req.body);
    res.json(await invoicingService.updateRecurringTemplate(tenantPrisma, requireParam(req, "id"), input));
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
