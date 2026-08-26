import bcrypt from "bcrypt";
import type { PrismaClient, Prisma } from "../../generated/tenant-client/client";
import { AppError } from "../../utils/errors";

type Db = PrismaClient | Prisma.TransactionClient;

export const MANAGER_PIN_ROLES = ["OWNER", "ADMIN", "MANAGER"] as const;

const PIN_ROUNDS = 12;

export function hashManagerPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, PIN_ROUNDS);
}

export async function assertManagerApproval(
  db: Db,
  pin: string | undefined,
  actor: { id: string; role: string },
): Promise<string> {
  const managers = await db.user.findMany({
    where: {
      role: { in: [...MANAGER_PIN_ROLES] },
      status: "ACTIVE",
      managerPinHash: { not: null },
    },
    select: { id: true, managerPinHash: true },
  });

  // Bootstrap: no PIN has been configured yet. A manager acting themselves
  // can approve; a cashier cannot (they would skip the control entirely).
  if (managers.length === 0) {
    if ((MANAGER_PIN_ROLES as readonly string[]).includes(actor.role)) return actor.id;
    throw new AppError(
      409,
      "MANAGER_PIN_NOT_CONFIGURED",
      "A manager must set a POS PIN before cashiers can refund, void, exchange, or override discounts",
    );
  }

  if (!pin) {
    throw new AppError(403, "MANAGER_PIN_REQUIRED", "Manager PIN is required for this POS operation");
  }

  for (const manager of managers) {
    if (manager.managerPinHash && (await bcrypt.compare(pin, manager.managerPinHash))) {
      return manager.id;
    }
  }

  throw new AppError(403, "INVALID_MANAGER_PIN", "Manager PIN is incorrect");
}
