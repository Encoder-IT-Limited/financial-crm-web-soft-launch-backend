export const MODULE_KEYS = [
  "accounting",
  "sales",
  "purchasing",
  "inventory",
  "banking",
  "crm",
  "reports",
  "ai-assistant",
  "pos",
  "hr-payroll",
  "calendar-booking",
  "social-media",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
