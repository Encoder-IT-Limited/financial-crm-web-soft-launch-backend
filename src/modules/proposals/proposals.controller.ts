import type { Request, Response, NextFunction } from "express";
import { requireParam } from "../../utils/params";
import { requireTenantAuth } from "../../utils/tenantContext";
import { env } from "../../config/env";
import * as v from "./proposals.validation";
import * as proposalsService from "./proposals.service";
import { toInvoiceResponse } from "../invoicing/invoicing.service";

export async function listProposalsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    res.json(await proposalsService.listProposals(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function getProposalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    res.json(await proposalsService.getProposal(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function createProposalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = requireTenantAuth(req);
    const input = v.createProposalSchema.parse(req.body);
    const mode = (typeof req.query.mode === "string" ? req.query.mode : input.mode) ?? "draft";
    const send = mode === "send";
    const proposal = await proposalsService.createProposal(tenantPrisma, tenantId, input, send);
    res.status(201).json(proposal);
  } catch (err) {
    next(err);
  }
}

export async function updateProposalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    const input = v.updateProposalSchema.parse(req.body);
    res.json(await proposalsService.updateProposal(tenantPrisma, requireParam(req, "id"), input));
  } catch (err) {
    next(err);
  }
}

export async function sendProposalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    res.json(await proposalsService.sendProposal(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function rejectProposalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    res.json(await proposalsService.rejectProposal(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function convertProposalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = requireTenantAuth(req);
    const result = await proposalsService.convertProposal(tenantPrisma, tenantId, requireParam(req, "id"));
    res.json({
      proposal: result.proposal,
      invoice: toInvoiceResponse(result.invoice, env.ROOT_DOMAIN),
    });
  } catch (err) {
    next(err);
  }
}
