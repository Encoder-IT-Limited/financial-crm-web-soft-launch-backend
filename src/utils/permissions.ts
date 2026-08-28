import type { ModuleKey } from "./moduleKeys";

export type { ModuleKey };

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: ["*"],
  ADMIN: ["*"],
  MANAGER: ["inventory.*", "procurement.*", "pos.*", "invoice.*", "customer.*"],
  INVENTORY_MANAGER: ["inventory.*", "procurement.*"],
  SALES_CASHIER: [
    "pos.view",
    "pos.createSale",
    "pos.refund",
    "invoice.view",
    "invoice.create",
    "customer.*",
  ],
  ACCOUNTANT: ["invoice.*", "customer.view"],
  VIEWER: ["*.view"],
};

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  INVENTORY_MANAGER: "Inventory Manager",
  SALES_CASHIER: "Sales / Cashier",
  ACCOUNTANT: "Accountant",
  VIEWER: "Viewer",
};

export const SYSTEM_ROLE_KEYS = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "INVENTORY_MANAGER",
  "SALES_CASHIER",
  "ACCOUNTANT",
  "VIEWER",
] as const;

export type PermissionCatalogGroup = {
  key: string;
  label: string;
  wildcard: string;
  permissions: { key: string; label: string }[];
};

export const PERMISSION_CATALOG: PermissionCatalogGroup[] = [
  {
    key: "users",
    label: "Users",
    wildcard: "user.*",
    permissions: [{ key: "user.manage", label: "Manage users and roles" }],
  },
  {
    key: "pos",
    label: "POS",
    wildcard: "pos.*",
    permissions: [
      { key: "pos.view", label: "View POS" },
      { key: "pos.createSale", label: "Create sales" },
      { key: "pos.refund", label: "Refund / void / exchange" },
      { key: "pos.manage", label: "Manage terminals and PIN" },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    wildcard: "inventory.*",
    permissions: [
      { key: "inventory.view", label: "View inventory" },
      { key: "inventory.adjust", label: "Adjust, write-off, approve transfers" },
    ],
  },
  {
    key: "procurement",
    label: "Procurement",
    wildcard: "procurement.*",
    permissions: [
      { key: "procurement.view", label: "View procurement" },
      { key: "procurement.approve", label: "Approve / reject / close POs" },
    ],
  },
  {
    key: "invoicing",
    label: "Invoicing",
    wildcard: "invoice.*",
    permissions: [
      { key: "invoice.view", label: "View invoices" },
      { key: "invoice.create", label: "Create invoices" },
    ],
  },
  {
    key: "customers",
    label: "Customers",
    wildcard: "customer.*",
    permissions: [
      { key: "customer.view", label: "View customers" },
      { key: "customer.create", label: "Create and edit customers" },
    ],
  },
  {
    key: "retainers",
    label: "Retainers",
    wildcard: "retainer.*",
    permissions: [{ key: "retainer.approve", label: "Forfeit and refund retainers" }],
  },
];

const CATALOG_KEYS = new Set(PERMISSION_CATALOG.flatMap((g) => [g.wildcard, ...g.permissions.map((p) => p.key)]));

export function isAllowedPermissionKey(key: string): boolean {
  return key === "*" || CATALOG_KEYS.has(key);
}

export function sanitizePermissions(keys: string[]): string[] {
  const unique = [...new Set(keys.filter(isAllowedPermissionKey))];
  return unique;
}

/** Fallback when a tenant row is missing (tests / pre-seed). */
export function defaultGrantsForRole(role: string): string[] {
  return ROLE_PERMISSIONS[role] ?? ["*.view"];
}

export function systemRoleCountsTowardSeats(key: string): boolean {
  return key !== "VIEWER";
}

export type SystemRoleSeed = {
  key: string;
  name: string;
  isSystem: true;
  countsTowardSeats: boolean;
  permissions: string[];
};

export function systemRoleSeeds(): SystemRoleSeed[] {
  return SYSTEM_ROLE_KEYS.map((key) => ({
    key,
    name: ROLE_LABELS[key] ?? key,
    isSystem: true as const,
    countsTowardSeats: systemRoleCountsTowardSeats(key),
    permissions: ROLE_PERMISSIONS[key] ?? ["*.view"],
  }));
}

const RESERVED_KEYS = new Set<string>(SYSTEM_ROLE_KEYS);

export function slugifyRoleKey(name: string): string {
  let slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  if (!slug) slug = "role";
  const upper = slug.toUpperCase();
  if (RESERVED_KEYS.has(upper) || slug === "owner") {
    slug = `${slug}_custom`;
  }
  return slug;
}

export function uniqueRoleKey(name: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  let key = slugifyRoleKey(name);
  if (!taken.has(key)) return key;
  let n = 2;
  while (taken.has(`${key}_${n}`)) n += 1;
  return `${key}_${n}`;
}

/** Static catalog used by tests and as a fallback before tenant rows exist. */
export function listRoleCatalog(): RoleCatalogEntry[] {
  return SYSTEM_ROLE_KEYS.map((key) => ({
    key,
    label: ROLE_LABELS[key] ?? key,
    name: ROLE_LABELS[key] ?? key,
    permissions: ROLE_PERMISSIONS[key] ?? ["*.view"],
    countsTowardSeats: systemRoleCountsTowardSeats(key),
    invitable: key !== "OWNER",
    isSystem: true,
  }));
}

export const INVITABLE_ROLES = SYSTEM_ROLE_KEYS.filter((key) => key !== "OWNER");

export function getGrantsForRole(role: string): string[] {
  return defaultGrantsForRole(role);
}

export type RoleCatalogEntry = {
  id?: string;
  key: string;
  label: string;
  name?: string;
  permissions: string[];
  countsTowardSeats: boolean;
  invitable: boolean;
  isSystem?: boolean;
  userCount?: number;
  description?: string | null;
};
