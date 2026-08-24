import type { PrismaClient } from "../../generated/tenant-client/client";

export function listCustomers(db: PrismaClient) {
  return db.customer.findMany({ orderBy: { createdAt: "desc" } });
}

export function findCustomer(db: PrismaClient, id: string) {
  return db.customer.findUnique({ where: { id } });
}

export function createCustomer(
  db: PrismaClient,
  data: {
    tenantId: string;
    customerCode: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    taxNumber?: string;
    creditLimit?: number;
    openingBalance: number;
    status: string;
  },
) {
  return db.customer.create({ data });
}

export function updateCustomer(db: PrismaClient, id: string, data: Record<string, unknown>) {
  return db.customer.update({ where: { id }, data });
}

export function deleteCustomer(db: PrismaClient, id: string) {
  return db.customer.delete({ where: { id } });
}
