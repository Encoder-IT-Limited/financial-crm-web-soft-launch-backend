export type TokenPairDto = {
  accessToken: string;
  refreshToken: string;
};

export type AuthUserDto = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type LoginResponseDto = TokenPairDto & { user: AuthUserDto };
