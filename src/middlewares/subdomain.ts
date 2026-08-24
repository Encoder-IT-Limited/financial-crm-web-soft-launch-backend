import { AppError } from "../utils/errors";

const SUBDOMAIN_RE = /^[a-z0-9-]{1,63}$/;

// Pure host-parsing logic, split out from tenantResolver so it's unit
// testable without a database. Returns null for a bare root-domain request
// (no subdomain), or throws AppError for anything malformed.
export function parseSubdomain(host: string, rootDomain: string): string | null {
  if (host === rootDomain) return null;

  if (!host.endsWith(`.${rootDomain}`)) {
    throw new AppError(400, "INVALID_HOST", `Host "${host}" is not part of ${rootDomain}`);
  }

  const subdomain = host.slice(0, -(rootDomain.length + 1));
  if (!SUBDOMAIN_RE.test(subdomain)) {
    throw new AppError(400, "INVALID_SUBDOMAIN", `Invalid subdomain: ${subdomain}`);
  }

  return subdomain;
}
