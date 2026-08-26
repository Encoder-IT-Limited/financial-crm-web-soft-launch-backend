import type { Request, Response, NextFunction } from "express";
import { requireParam } from "../../utils/params";
import { requireTenantAuth } from "../../utils/tenantContext";
import { env } from "../../config/env";
import { ok } from "../../utils/envelope";
import { resolveCurrency, withCurrency } from "../../utils/currency";
import * as v from "./proposals.validation";
import * as proposalsService from "./proposals.service";
import { toInvoiceResponse } from "../invoicing/invoicing.service";

function stamp<T extends { currency?: string | null }>(req: Request, doc: T) {
  const tenantCurrency = resolveCurrency(req.tenant?.currency);
  return withCurrency(doc, resolveCurrency(doc.currency, tenantCurrency));
}

export async function listProposalsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    const query = v.listPageQuerySchema.parse(req.query);
    const { items, meta } = await proposalsService.listProposals(tenantPrisma, query);
    res.json(ok(items.map((p) => stamp(req, p)), meta));
  } catch (err) {
    next(err);
  }
}

export async function nextProposalNumberHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    res.json(await proposalsService.peekNextProposalNumber(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function getProposalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    res.json(stamp(req, await proposalsService.getProposal(tenantPrisma, requireParam(req, "id"))));
  } catch (err) {
    next(err);
  }
}

export async function createProposalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, tenant } = requireTenantAuth(req);
    const input = v.createProposalSchema.parse(req.body);
    const mode = (typeof req.query.mode === "string" ? req.query.mode : input.mode) ?? "draft";
    const send = mode === "send";
    const proposal = await proposalsService.createProposal(
      tenantPrisma,
      tenantId,
      { ...input, currency: resolveCurrency(input.currency, tenant.currency) },
      send,
    );
    res.status(201).json(stamp(req, proposal));
  } catch (err) {
    next(err);
  }
}

export async function updateProposalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    const input = v.updateProposalSchema.parse(req.body);
    res.json(stamp(req, await proposalsService.updateProposal(tenantPrisma, requireParam(req, "id"), input)));
  } catch (err) {
    next(err);
  }
}

export async function sendProposalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    res.json(stamp(req, await proposalsService.sendProposal(tenantPrisma, requireParam(req, "id"))));
  } catch (err) {
    next(err);
  }
}

export async function rejectProposalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    res.json(stamp(req, await proposalsService.rejectProposal(tenantPrisma, requireParam(req, "id"))));
  } catch (err) {
    next(err);
  }
}

export async function convertProposalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, tenant } = requireTenantAuth(req);
    const result = await proposalsService.convertProposal(tenantPrisma, tenantId, requireParam(req, "id"));
    res.json({
      proposal: stamp(req, result.proposal),
      invoice: toInvoiceResponse(result.invoice, env.ROOT_DOMAIN, tenant.currency),
    });
  } catch (err) {
    next(err);
  }
}
