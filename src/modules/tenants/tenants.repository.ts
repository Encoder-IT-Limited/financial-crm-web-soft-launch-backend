import { publicPrisma } from "../../db/publicPrisma";

export function findTenantBySubdomainOrSchema(subdomain: string, schemaName: string) {
  return publicPrisma.tenant.findFirst({
    where: { OR: [{ subdomain }, { schemaName }] },
  });
}

export function findTenantById(id: string) {
  return publicPrisma.tenant.findUnique({ where: { id } });
}

export function findTenantBySubdomain(subdomain: string) {
  return publicPrisma.tenant.findUnique({ where: { subdomain } });
}

export function listTenantRows() {
  return publicPrisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
}

export function createTenantRow(data: {
  name: string;
  legalName?: string;
  email: string;
  country?: string;
  subdomain: string;
  schemaName: string;
  status: "PROVISIONING";
  lifecycle: string;
  billingCycle: string;
}) {
  return publicPrisma.tenant.create({ data });
}

export function updateTenantRow(id: string, data: Record<string, unknown>) {
  return publicPrisma.tenant.update({ where: { id }, data });
}
