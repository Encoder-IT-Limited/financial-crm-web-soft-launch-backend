import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { fail } from "../utils/envelope";

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

  const prismaCode = prismaErrorCode(err);
  if (prismaCode === "P2002") {
    return res.status(409).json(fail("CONFLICT", "A record with that unique value already exists", undefined, requestId));
  }
  if (prismaCode === "P2023") {
    return res.status(400).json(fail("INVALID_ID", "Invalid identifier", undefined, requestId));
  }
  if (prismaCode === "P2025") {
    return res.status(404).json(fail("NOT_FOUND", "Record not found", undefined, requestId));
  }

  logger.error({ err }, "Unhandled error");
  return res.status(500).json(fail("INTERNAL_ERROR", "Something went wrong", undefined, requestId));
}

function prismaErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object" || !("code" in err)) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
