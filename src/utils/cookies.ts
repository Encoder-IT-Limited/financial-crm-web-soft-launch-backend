import type { CookieOptions, Request, Response } from "express";
import { env } from "../config/env";

export const COOKIE = {
  access: "access_token",
  refresh: "refresh_token",
  csrf: "csrf",
  sessionHint: "mrm_session",
} as const;

function baseCookie(overrides: CookieOptions = {}): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    ...overrides,
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(COOKIE.access, accessToken, baseCookie());
  res.cookie(COOKIE.refresh, refreshToken, baseCookie({ httpOnly: true }));
  res.cookie(COOKIE.sessionHint, "1", baseCookie({ httpOnly: false }));
}

export function clearAuthCookies(res: Response) {
  const clear = baseCookie({ maxAge: 0 });
  res.cookie(COOKIE.access, "", clear);
  res.cookie(COOKIE.refresh, "", clear);
  res.cookie(COOKIE.sessionHint, "", { ...clear, httpOnly: false });
}

export function setCsrfCookie(res: Response, token: string) {
  res.cookie(COOKIE.csrf, token, baseCookie({ httpOnly: false }));
}

export function readBearerOrCookie(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  const fromCookie = req.cookies?.[COOKIE.access];
  return typeof fromCookie === "string" && fromCookie.length > 0 ? fromCookie : undefined;
}
