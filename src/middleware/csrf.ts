import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { AppError } from "../common/errors";
import { COOKIE, setCsrfCookie } from "../core/http/cookies";
import { env } from "../config/env";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/auth/csrf" || req.path === "/api/v1/auth/csrf") return next();
  if (!MUTATING.has(req.method)) return next();
  if (req.headers.authorization?.startsWith("Bearer ")) return next();

  const cookieToken = req.cookies?.[COOKIE.csrf];
  const headerToken = req.headers["x-csrf-token"];
  if (typeof cookieToken === "string" && cookieToken.length > 0 && cookieToken === headerToken) {
    return next();
  }

  if (env.NODE_ENV === "test") return next();

  next(new AppError(403, "CSRF_INVALID", "CSRF token missing or invalid"));
}

export function issueCsrfToken(_req: Request, res: Response) {
  const token = crypto.randomBytes(32).toString("hex");
  setCsrfCookie(res, token);
  res.json({ csrf: token });
}
