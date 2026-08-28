import type { Request, Response, NextFunction } from "express";
import { requireTenantAuth } from "../../utils/tenantContext";
import { requireUuidParam } from "../../utils/params";
import { ok } from "../../utils/envelope";
import {
  acceptInviteSchema,
  createInviteSchema,
  createRoleSchema,
  listUsersQuerySchema,
  previewInviteQuerySchema,
  updateRoleSchema,
  updateUserSchema,
} from "./users.validation";
import * as usersService from "./users.service";
import * as rolesService from "./roles.service";
import { getTenantPrismaClient } from "../../db/tenantClientCache";
import { setAuthCookies } from "../../utils/cookies";
import { buildMe } from "../auth/me.service";
import * as authService from "../auth/auth.service";

function omitEmptyQuery(query: Request["query"]) {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== "" && value !== undefined));
}

export async function listRolesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenant, tenantPrisma } = requireTenantAuth(req);
    res.json(await rolesService.listRoles(tenantPrisma, tenant.id));
  } catch (err) {
    next(err);
  }
}

export async function permissionCatalogHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(rolesService.permissionCatalog());
  } catch (err) {
    next(err);
  }
}

export async function createRoleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenant, tenantPrisma } = requireTenantAuth(req);
    const input = createRoleSchema.parse(req.body);
    res.status(201).json(await rolesService.createRole(tenantPrisma, tenant.id, input));
  } catch (err) {
    next(err);
  }
}

export async function updateRoleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenant, tenantPrisma } = requireTenantAuth(req);
    const input = updateRoleSchema.parse(req.body);
    res.json(await rolesService.updateRole(tenantPrisma, tenant.id, requireUuidParam(req, "id"), input));
  } catch (err) {
    next(err);
  }
}

export async function deleteRoleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenant, tenantPrisma } = requireTenantAuth(req);
    res.json(await rolesService.deleteRole(tenantPrisma, tenant.id, requireUuidParam(req, "id")));
  } catch (err) {
    next(err);
  }
}

export async function getSeatsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenant } = requireTenantAuth(req);
    res.json(await usersService.getSeats(tenant.id, tenant.schemaName));
  } catch (err) {
    next(err);
  }
}

export async function listUsersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenant, tenantPrisma } = requireTenantAuth(req);
    const query = listUsersQuerySchema.parse(omitEmptyQuery(req.query));
    const { items, meta } = await usersService.listUsers(tenantPrisma, tenant.id, query);
    res.json(ok(items, meta));
  } catch (err) {
    next(err);
  }
}

export async function createInviteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenant, user } = requireTenantAuth(req);
    const input = createInviteSchema.parse(req.body);
    const created = await usersService.createInvite({
      tenantId: tenant.id,
      schemaName: tenant.schemaName,
      tenantName: tenant.name,
      actorId: user.id,
      name: input.name,
      email: input.email,
      role: input.role,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function resendInviteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenant } = requireTenantAuth(req);
    const created = await usersService.resendInvite({
      tenantId: tenant.id,
      tenantName: tenant.name,
      inviteId: requireUuidParam(req, "id"),
    });
    res.json(created);
  } catch (err) {
    next(err);
  }
}

export async function cancelInviteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenant } = requireTenantAuth(req);
    res.json(
      await usersService.cancelInvite({
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        inviteId: requireUuidParam(req, "id"),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function updateUserHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenant, user } = requireTenantAuth(req);
    const input = updateUserSchema.parse(req.body);
    res.json(
      await usersService.updateUser({
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        actorId: user.id,
        userId: requireUuidParam(req, "id"),
        name: input.name,
        role: input.role,
        status: input.status,
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function previewInviteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = previewInviteQuerySchema.parse(req.query);
    res.json(await usersService.previewInvite(token));
  } catch (err) {
    next(err);
  }
}

export async function acceptInviteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password } = acceptInviteSchema.parse(req.body);
    const accepted = await usersService.acceptInvite(token, password);
    const tenantPrisma = getTenantPrismaClient(accepted.tenant.schemaName);
    const result = await authService.login(tenantPrisma, accepted.tenant.id, accepted.email, password);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    req.tenant = {
      id: accepted.tenant.id,
      name: accepted.tenant.name,
      subdomain: accepted.tenant.subdomain,
      schemaName: accepted.tenant.schemaName,
      status: accepted.tenant.status,
      lifecycle: accepted.tenant.lifecycle,
    };
    req.tenantPrisma = tenantPrisma;
    req.user = {
      id: result.user.id,
      email: result.user.email,
      role: result.user.role,
      realm: "tenant",
      name: result.user.name,
      tenantId: accepted.tenant.id,
    };
    res.json(await buildMe(req));
  } catch (err) {
    next(err);
  }
}
