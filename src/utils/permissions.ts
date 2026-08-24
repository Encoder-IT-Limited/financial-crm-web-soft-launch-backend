import type { ModuleKey } from "./moduleKeys";

export type { ModuleKey };

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: ["*"],
  ADMIN: ["*"],
  MANAGER: ["inventory.*", "procurement.*", "pos.*", "invoice.*", "customer.*"],
  INVENTORY_MANAGER: ["inventory.*", "procurement.*"],
  SALES_CASHIER: ["pos.*", "invoice.view", "invoice.create", "customer.*"],
  ACCOUNTANT: ["invoice.*", "customer.view"],
  VIEWER: ["*.view"],
};
