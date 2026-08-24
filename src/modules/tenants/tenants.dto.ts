export type TenantUserDto = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type TenantSummaryDto = {
  id: string;
  name: string;
  legalName: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  subdomain: string;
  planId: string | null;
  planName: string | null;
  status: string;
  billingCycle: string;
  extraSeatsPurchased: number;
  seats: { used: number; total: number };
  createdAt: string;
  renewalDate: string | null;
  pendingDeletionAt: string | null;
  modules: string[];
  users: TenantUserDto[];
};
