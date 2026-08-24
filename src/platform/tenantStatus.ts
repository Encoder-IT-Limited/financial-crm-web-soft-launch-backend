export type ApiTenantStatus = "active" | "read-only" | "pending-deletion" | "cancelled";

export function toApiTenantStatus(lifecycle: string, status: string): ApiTenantStatus {
  if (lifecycle === "pending-deletion" || lifecycle === "cancelled" || lifecycle === "read-only" || lifecycle === "active") {
    return lifecycle;
  }
  if (status === "SUSPENDED") return "read-only";
  if (status === "ACTIVE") return "active";
  return "cancelled";
}

export function isTenantWritable(status: string, lifecycle: string): boolean {
  return status === "ACTIVE" && lifecycle === "active";
}
