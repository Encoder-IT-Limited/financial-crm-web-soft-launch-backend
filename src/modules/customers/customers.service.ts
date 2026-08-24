import crypto from "node:crypto";
import type { PrismaClient } from "../../generated/tenant-client/client";
import { AppError } from "../../utils/errors";
import type { z } from "zod";
import { createCustomerSchema, updateCustomerSchema } from "./customers.validation";
import * as customersRepository from "./customers.repository";

export function listCustomers(db: PrismaClient) {
  return customersRepository.listCustomers(db);
}

export async function getCustomer(db: PrismaClient, id: string) {
  const customer = await customersRepository.findCustomer(db, id);
  if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");
  return customer;
}

export function createCustomer(db: PrismaClient, tenantId: string, input: z.infer<typeof createCustomerSchema>) {
  return customersRepository.createCustomer(db, {
    tenantId,
    customerCode: input.customerCode ?? `CUST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    name: input.name,
    email: input.email,
    phone: input.phone,
    address: input.address,
    taxNumber: input.taxNumber,
    creditLimit: input.creditLimit,
    openingBalance: input.openingBalance ?? 0,
    status: input.status ?? "ACTIVE",
  });
}

export function updateCustomer(db: PrismaClient, id: string, input: z.infer<typeof updateCustomerSchema>) {
  return customersRepository.updateCustomer(db, id, input);
}
