import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../utils/errors";
import { loginSchema, refreshSchema, forgotPasswordSchema, verifyOtpSchema, resetPasswordSchema } from "./auth.validation";
import * as authService from "./auth.service";
import { platformLogin, platformRotateRefresh } from "./platform-auth.service";
import { setAuthCookies, clearAuthCookies, COOKIE } from "../../utils/cookies";
import { buildMe } from "./me.service";
import { provisionTenant, slugifySubdomain } from "../tenants/tenants.service";
import { signupSchema } from "../tenants/tenants.validation";
import * as passwordReset from "./password-reset.service";
import { toPlanDto, listPlans } from "../plans/plans.service";
import { env } from "../../config/env";
import { hostHasTenantSubdomain } from "../../middlewares/subdomain";
import { getTenantPrismaClient } from "../../db/tenantClientCache";
import { publicPrisma } from "../../db/publicPrisma";

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const platform = await platformLogin(email, password);
    if (platform) {
      setAuthCookies(res, platform.accessToken, platform.refreshToken);
      req.user = {
        id: platform.user.id,
        email: platform.user.email,
        role: platform.user.role,
        realm: "admin",
        name: platform.user.name,
      };
      const me = await buildMe(req);
      return res.json({ ...me, tokens: { accessToken: platform.accessToken, refreshToken: platform.refreshToken } });
    }

    if (!req.tenant || !req.tenantPrisma) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const result = await authService.login(req.tenantPrisma, req.tenant.id, email, password);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    req.user = {
      id: result.user.id,
      email: result.user.email,
      role: result.user.role,
      realm: "tenant",
      name: result.user.name,
      tenantId: req.tenant.id,
    };
    const me = await buildMe(req);
    res.json({ ...me, tokens: { accessToken: result.accessToken, refreshToken: result.refreshToken } });
  } catch (err) {
    next(err);
  }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const bodyToken = refreshSchema.safeParse(req.body);
    const refreshToken =
      (bodyToken.success ? bodyToken.data.refreshToken : undefined) ??
      (typeof req.cookies?.[COOKIE.refresh] === "string" ? req.cookies[COOKIE.refresh] : undefined);
    if (!refreshToken) throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is required");

    try {
      const platform = await platformRotateRefresh(refreshToken);
      setAuthCookies(res, platform.accessToken, platform.refreshToken);
      return res.json({ tokens: { accessToken: platform.accessToken, refreshToken: platform.refreshToken } });
    } catch {
      // fall through to tenant refresh
    }

    if (!req.tenant || !req.tenantPrisma) {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
    }
    const result = await authService.refresh(req.tenantPrisma, req.tenant.id, refreshToken);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({ tokens: { accessToken: result.accessToken, refreshToken: result.refreshToken } });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(_req: Request, res: Response) {
  clearAuthCookies(res);
  res.json({ loggedOut: true });
}

export async function meHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.realm === "tenant" && req.tenantPrisma) {
      const user = await req.tenantPrisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) throw new AppError(401, "UNAUTHENTICATED", "Not authenticated");
      req.user.name = user.name;
      req.user.role = user.role;
    }
    if (req.user?.realm === "admin") {
      const user = await publicPrisma.platformUser.findUnique({ where: { id: req.user.id } });
      if (!user) throw new AppError(401, "UNAUTHENTICATED", "Not authenticated");
      req.user.name = user.name;
    }
    res.json(await buildMe(req));
  } catch (err) {
    next(err);
  }
}

export async function signupHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (hostHasTenantSubdomain(req.hostname, env.ROOT_DOMAIN)) {
      throw new AppError(400, "ROOT_DOMAIN_ONLY", "Signup must be called on the root domain");
    }
    const input = signupSchema.parse(req.body);
    let subdomain = slugifySubdomain(input.company.name);
    if (!subdomain) subdomain = `tenant-${Date.now().toString(36)}`;

    const clash = await publicPrisma.tenant.findUnique({ where: { subdomain } });
    if (clash) subdomain = `${subdomain}-${Date.now().toString(36).slice(-4)}`;

    const tenant = await provisionTenant({
      name: input.company.name,
      subdomain,
      ownerName: input.owner.name,
      ownerEmail: input.owner.email,
      ownerPassword: input.owner.password,
      country: input.company.country,
      planId: input.planId,
    });

    const tenantPrisma = getTenantPrismaClient(tenant.schemaName);
    const result = await authService.login(tenantPrisma, tenant.id, input.owner.email, input.owner.password);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    req.tenant = {
      id: tenant.id,
      name: tenant.name,
      subdomain: tenant.subdomain,
      schemaName: tenant.schemaName,
      status: tenant.status,
      lifecycle: tenant.lifecycle,
    };
    req.user = {
      id: result.user.id,
      email: result.user.email,
      role: result.user.role,
      realm: "tenant",
      name: result.user.name,
      tenantId: tenant.id,
    };
    res.status(201).json(await buildMe(req));
  } catch (err) {
    next(err);
  }
}

export async function listPublicPlansHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json((await listPlans(true)).map(toPlanDto));
  } catch (err) {
    next(err);
  }
}

export async function forgotPasswordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    res.json(await passwordReset.requestPasswordReset(email));
  } catch (err) {
    next(err);
  }
}

export async function verifyOtpHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, otp } = verifyOtpSchema.parse(req.body);
    res.json(await passwordReset.verifyPasswordOtp(email, otp));
  } catch (err) {
    next(err);
  }
}

export async function resetPasswordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, otp, password } = resetPasswordSchema.parse(req.body);
    res.json(await passwordReset.resetPassword(email, otp, password, req.tenantPrisma));
  } catch (err) {
    next(err);
  }
}
