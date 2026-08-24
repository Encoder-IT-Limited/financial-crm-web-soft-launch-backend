import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../common/errors";
import { logger } from "../common/logger";
import { fail } from "../core/http/envelope";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : undefined;

  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err }, err.message);
    return res.status(err.status).json(fail(err.code, err.message, undefined, requestId));
  }

  if (err instanceof ZodError) {
    return res.status(400).json(
      fail("VALIDATION_ERROR", "Invalid request", err.flatten() as unknown as Record<string, unknown>, requestId),
    );
  }

  logger.error({ err }, "Unhandled error");
  return res.status(500).json(fail("INTERNAL_ERROR", "Something went wrong", undefined, requestId));
}
