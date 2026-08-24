import type { Request } from "express";
import { AppError } from "./errors";

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
