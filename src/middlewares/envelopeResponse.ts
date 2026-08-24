import type { Request, Response, NextFunction } from "express";
import { isEnvelope, ok } from "../utils/envelope";

export function envelopeResponse(_req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (isEnvelope(body)) return originalJson(body);
    return originalJson(ok(body));
  }) as Response["json"];
  next();
}
