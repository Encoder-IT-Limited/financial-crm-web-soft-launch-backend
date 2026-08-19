import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../common/errors";
import { requireParam } from "../../common/params";
import { env } from "../../config/env";
import * as v from "./invoicing.validators";
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
    const invoice = await invoicingService.fulfillInvoice(
      tenantPrisma,
      tenantId,
      requireParam(req, "id"),
      input.warehouseId,
      userId,
    );
    res.json(invoicingService.toInvoiceResponse(invoice, env.ROOT_DOMAIN));
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

export async function createCreditNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = ctx(req);
    const input = v.createCreditNoteSchema.parse(req.body);
    res.status(201).json(await invoicingService.createCreditNote(tenantPrisma, tenantId, input, userId));
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
