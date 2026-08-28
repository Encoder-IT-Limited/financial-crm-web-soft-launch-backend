export type TenantUserStatus = "ACTIVE" | "DISABLED" | "INVITED";

export type TenantUserDto = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: TenantUserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  inviteId: string | null;
};

export type SeatUsageDto = {
  used: number;
  total: number;
  message: string;
};

export type InviteCreatedDto = TenantUserDto & {
  acceptToken?: string;
  acceptUrl?: string;
};

export type InvitePreviewDto = {
  email: string;
  name: string;
  role: string;
  tenantName: string;
};

export type RoleDto = {
  id: string;
  key: string;
  name: string;
  label: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  countsTowardSeats: boolean;
  invitable: boolean;
  userCount: number;
};
