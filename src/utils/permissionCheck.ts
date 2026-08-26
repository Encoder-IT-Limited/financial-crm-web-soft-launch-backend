/** Matches a required permission against the grants on a role. */
export function permissionAllowed(granted: string[], required: string): boolean {
  for (const grant of granted) {
    if (grant === "*") return true;
    if (grant === required) return true;
    if (grant.endsWith(".*")) {
      const prefix = grant.slice(0, -2);
      if (required === prefix || required.startsWith(`${prefix}.`)) return true;
    }
    if (grant.startsWith("*.")) {
      const suffix = grant.slice(1);
      if (required.endsWith(suffix)) return true;
    }
  }
  return false;
}
