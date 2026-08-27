import type { Request } from "express";
import { AppError } from "./errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Express 5 types req.params values as `string | string[]` (repeated-param
// route patterns can produce arrays). Every route in this codebase uses
// single-value params, so this narrows and validates in one place.
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError(400, "INVALID_PARAM", `Missing or invalid path parameter: ${name}`);
  }
  return value;
}

/** Rejects non-UUID path ids before Prisma throws P2023 as INTERNAL_ERROR. */
export function requireUuidParam(req: Request, name: string): string {
  const value = requireParam(req, name);
  if (!UUID_RE.test(value)) {
    throw new AppError(400, "INVALID_ID", `Invalid ${name}`);
  }
  return value;
}
