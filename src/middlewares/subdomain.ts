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

/** True only when the Host is a real tenant subdomain of ROOT_DOMAIN (e.g. acme.yourapp.com). */
export function hostHasTenantSubdomain(host: string, rootDomain: string): boolean {
  try {
    return parseSubdomain(host, rootDomain) !== null;
  } catch {
    return false;
  }
}

/** Platform routes that must not inherit a tenant (soft-launch default or X-Tenant-Subdomain). */
export function isPlatformUnscopedPath(path: string): boolean {
  return /^\/api(?:\/v1)?\/(?:auth\/signup|auth\/invite|auth\/accept-invite|platform\/tenants)\/?$/.test(path);
}
