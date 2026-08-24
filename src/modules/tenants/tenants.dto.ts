export type TenantSummaryDto = {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  planId: string | null;
  seats: { used: number; total: number };
};
