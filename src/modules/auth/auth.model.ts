export type TenantUserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  status: string;
};

export type RefreshTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};
