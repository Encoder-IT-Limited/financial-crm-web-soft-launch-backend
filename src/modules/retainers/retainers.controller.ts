import type { Request, Response, NextFunction } from "express";
import { requireParam } from "../../utils/params";
import { requireTenantAuth } from "../../utils/tenantContext";
import { env } from "../../config/env";
import { toInvoiceResponse } from "../invoicing/invoicing.service";
import * as v from "./retainers.validation";
import * as retainersService from "./retainers.service";

export async function listRetainersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    res.json(await retainersService.listRetainers(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function getRetainerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    res.json(await retainersService.getRetainer(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function createRetainerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = requireTenantAuth(req);
    const input = v.createRetainerSchema.parse(req.body);
    res.status(201).json(await retainersService.createRetainer(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function updateRetainerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    const input = v.updateRetainerSchema.parse(req.body);
    res.json(await retainersService.updateRetainer(tenantPrisma, requireParam(req, "id"), input));
  } catch (err) {
    next(err);
  }
}

export async function setRetainerStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    const input = v.setRetainerStatusSchema.parse(req.body);
    res.json(await retainersService.setRetainerStatus(tenantPrisma, requireParam(req, "id"), input.status));
  } catch (err) {
    next(err);
  }
}

export async function drawRetainerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = requireTenantAuth(req);
    const input = v.drawRetainerSchema.parse(req.body);
    const result = await retainersService.drawRetainer(
      tenantPrisma,
      tenantId,
      requireParam(req, "id"),
      input,
      userId,
    );
    res.json({
      retainer: result.retainer,
      payment: result.payment,
      invoice: toInvoiceResponse(result.invoice, env.ROOT_DOMAIN),
    });
  } catch (err) {
    next(err);
  }
}

export async function topUpRetainerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    const input = v.topUpRetainerSchema.parse(req.body);
    res.json(await retainersService.topUpRetainer(tenantPrisma, requireParam(req, "id"), input));
  } catch (err) {
    next(err);
  }
}

export async function transferRetainerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    const input = v.transferRetainerSchema.parse(req.body);
    res.json(await retainersService.transferRetainer(tenantPrisma, requireParam(req, "id"), input.toRetainerId));
  } catch (err) {
    next(err);
  }
}

export async function rollOverRetainerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    const input = v.rollOverRetainerSchema.parse(req.body ?? {});
    res.json(await retainersService.rollOverRetainer(tenantPrisma, requireParam(req, "id"), input.expiryDate));
  } catch (err) {
    next(err);
  }
}

export async function forfeitRetainerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = requireTenantAuth(req);
    res.json(await retainersService.forfeitRetainer(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function refundRetainerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, userId } = requireTenantAuth(req);
    const input = v.refundRetainerSchema.parse(req.body);
    res.json(
      await retainersService.refundRetainer(tenantPrisma, tenantId, requireParam(req, "id"), input.reason, userId),
    );
  } catch (err) {
    next(err);
  }
}
