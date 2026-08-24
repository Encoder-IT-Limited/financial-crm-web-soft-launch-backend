import crypto from "node:crypto";
import type { PrismaClient } from "../../generated/tenant-client/client";
import { AppError } from "../../utils/errors";
import type { z } from "zod";
import { createCustomerSchema, updateCustomerSchema } from "./customers.validation";
import type { CustomerDto } from "./customers.dto";
import * as customersRepository from "./customers.repository";

function toCustomerDto(row: {
  id: string;
  customerCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  creditLimit: unknown;
  openingBalance: unknown;
  status: string;
}): CustomerDto {
  return {
    id: row.id,
    customerCode: row.customerCode,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    taxNumber: row.taxNumber,
    creditLimit: Number(row.creditLimit ?? 0),
    openingBalance: Number(row.openingBalance ?? 0),
    status: row.status,
  };
}

export async function listCustomers(db: PrismaClient) {
  return (await customersRepository.listCustomers(db)).map(toCustomerDto);
}

export async function getCustomer(db: PrismaClient, id: string) {
  const customer = await customersRepository.findCustomer(db, id);
  if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");
  return toCustomerDto(customer);
}

export async function createCustomer(db: PrismaClient, tenantId: string, input: z.infer<typeof createCustomerSchema>) {
  const created = await customersRepository.createCustomer(db, {
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
  return toCustomerDto(created);
}

export async function updateCustomer(db: PrismaClient, id: string, input: z.infer<typeof updateCustomerSchema>) {
  await getCustomer(db, id);
  return toCustomerDto(await customersRepository.updateCustomer(db, id, input));
}

export async function deleteCustomer(db: PrismaClient, id: string) {
  await getCustomer(db, id);
  try {
    await customersRepository.deleteCustomer(db, id);
  } catch {
    throw new AppError(409, "CUSTOMER_IN_USE", "Customer cannot be deleted because it is referenced by other records");
  }
}
