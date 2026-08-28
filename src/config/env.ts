import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4001),
  ROOT_DOMAIN: z.string().min(1),

  PUBLIC_DATABASE_URL: z.string().url(),
  TENANT_DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),

  PLATFORM_ADMIN_EMAIL: z.string().email().optional(),
  PLATFORM_ADMIN_PASSWORD: z.string().min(8).optional(),
  PLATFORM_ADMIN_NAME: z.string().min(1).optional(),

  APP_URL: z.string().url().default("http://localhost:3001"),
  SMTP_HOST: z.string().optional(),
});

export const env = envSchema.parse(process.env);
