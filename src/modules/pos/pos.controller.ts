import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../utils/errors";
import { requireParam } from "../../utils/params";
import { resolveCurrency } from "../../utils/currency";
import * as v from "./pos.validation";
import * as posService from "./pos.service";

function omitEmptyQuery(query: Request["query"]) {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== "" && value !== undefined));
}

function ctx(req: Request) {
  if (!req.tenant || !req.tenantPrisma) throw new AppError(400, "TENANT_REQUIRED", "Tenant subdomain required");
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Not authenticated");
  return {
    tenantId: req.tenant.id,
    tenantPrisma: req.tenantPrisma,
    actor: { id: req.user.id, role: req.user.role },
  };
}

export async function listTerminalsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const query = v.listTerminalsQuerySchema.parse(omitEmptyQuery(req.query));
    res.json(await posService.listTerminals(tenantPrisma, query.status));
  } catch (err) {
    next(err);
  }
}

export async function createTerminalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const input = v.createTerminalSchema.parse(req.body);
    res.status(201).json(await posService.createTerminal(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function updateTerminalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const input = v.updateTerminalSchema.parse(req.body);
    res.json(await posService.updateTerminal(tenantPrisma, requireParam(req, "id"), input));
  } catch (err) {
    next(err);
  }
}

export async function deleteTerminalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await posService.deactivateTerminal(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function setTerminalStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const input = v.updateTerminalSchema.pick({ status: true }).parse(req.body);
    if (!input.status) throw new AppError(400, "VALIDATION_ERROR", "status is required");
    res.json(await posService.updateTerminal(tenantPrisma, requireParam(req, "id"), { status: input.status }));
  } catch (err) {
    next(err);
  }
}

export async function openSessionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, actor } = ctx(req);
    const input = v.openSessionSchema.parse(req.body);
    res.status(201).json(await posService.openSession(tenantPrisma, tenantId, input, actor.id));
  } catch (err) {
    next(err);
  }
}

export async function listSessionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const query = v.listSessionsQuerySchema.parse(omitEmptyQuery(req.query));
    res.json(await posService.listSessions(tenantPrisma, query));
  } catch (err) {
    next(err);
  }
}

export async function getSessionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await posService.getSession(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function getOpenSessionForTerminalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await posService.getOpenSessionForTerminal(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function closeSessionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const input = v.closeSessionSchema.parse(req.body);
    res.json(await posService.closeSession(tenantPrisma, requireParam(req, "id"), input.closingCash));
  } catch (err) {
    next(err);
  }
}

export async function getNextSaleNumberHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await posService.peekNextSaleNumber(tenantPrisma));
  } catch (err) {
    next(err);
  }
}

export async function createSaleHandler(req: Request, res: Response, next: NextFunction) {
  const parsed = v.createSaleSchema.safeParse(req.body);
  try {
    const { tenantPrisma, tenantId, actor } = ctx(req);
    const input = parsed.success ? parsed.data : v.createSaleSchema.parse(req.body);
    const currency = resolveCurrency(req.tenant?.currency);
    res.status(201).json(await posService.createSale(tenantPrisma, tenantId, input, actor, currency));
  } catch (err) {
    if (parsed.success && parsed.data.isOfflineSync) {
      try {
        const { tenantPrisma, tenantId } = ctx(req);
        await posService.recordSyncFailure(tenantPrisma, tenantId, { ...parsed.data }, err);
      } catch {
        // recording the failure must not mask the original error
      }
    }
    next(err);
  }
}

export async function listSalesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const query = v.listSalesQuerySchema.parse(omitEmptyQuery(req.query));
    res.json(await posService.listSales(tenantPrisma, query));
  } catch (err) {
    next(err);
  }
}

export async function getSaleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await posService.getSale(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function getReceiptHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await posService.getReceipt(tenantPrisma, requireParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function refundSaleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, actor } = ctx(req);
    const input = v.refundSaleSchema.parse(req.body);
    res.status(201).json(
      await posService.refundSale(
        tenantPrisma,
        tenantId,
        requireParam(req, "id"),
        input.items,
        input.reason,
        actor,
        input.managerPin,
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function voidSaleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, actor } = ctx(req);
    const input = v.voidSaleSchema.parse(req.body ?? {});
    res.json(await posService.voidSale(tenantPrisma, tenantId, requireParam(req, "id"), actor, input.managerPin));
  } catch (err) {
    next(err);
  }
}

export async function exchangeSaleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, actor } = ctx(req);
    const input = v.exchangeSaleSchema.parse(req.body);
    res.status(201).json(
      await posService.exchangeSale(tenantPrisma, tenantId, requireParam(req, "id"), input, actor),
    );
  } catch (err) {
    next(err);
  }
}

export async function lookupBarcodeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    res.json(await posService.lookupCatalogByBarcode(tenantPrisma, requireParam(req, "barcode")));
  } catch (err) {
    next(err);
  }
}

export async function listDiscountRulesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    res.json(await posService.listDiscountRules(tenantPrisma, tenantId));
  } catch (err) {
    next(err);
  }
}

export async function createDiscountRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const input = v.createDiscountRuleSchema.parse(req.body);
    res.status(201).json(await posService.createDiscountRule(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function updateDiscountRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const input = v.updateDiscountRuleSchema.parse(req.body);
    res.json(await posService.updateDiscountRule(tenantPrisma, requireParam(req, "id"), input));
  } catch (err) {
    next(err);
  }
}

export async function setManagerPinHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, actor } = ctx(req);
    const input = v.managerPinSchema.parse(req.body);
    res.json(await posService.setManagerPin(tenantPrisma, actor, input));
  } catch (err) {
    next(err);
  }
}

export async function listSyncFailuresHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma } = ctx(req);
    const raw = typeof req.query.status === "string" ? req.query.status : undefined;
    const status = raw === "PENDING" || raw === "RESOLVED" || raw === "DISCARDED" ? raw : undefined;
    res.json(await posService.listSyncFailures(tenantPrisma, status));
  } catch (err) {
    next(err);
  }
}

export async function reportSyncFailureHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId } = ctx(req);
    const input = v.reportSyncFailureSchema.parse(req.body);
    res.status(201).json(await posService.reportSyncFailure(tenantPrisma, tenantId, input));
  } catch (err) {
    next(err);
  }
}

export async function retrySyncFailureHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, tenantId, actor } = ctx(req);
    res.json(await posService.retrySyncFailure(tenantPrisma, tenantId, requireParam(req, "id"), actor));
  } catch (err) {
    next(err);
  }
}

export async function resolveSyncFailureHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantPrisma, actor } = ctx(req);
    const input = v.resolveSyncFailureSchema.parse(req.body);
    res.json(await posService.resolveSyncFailure(tenantPrisma, requireParam(req, "id"), input.status, actor.id));
  } catch (err) {
    next(err);
  }
}
