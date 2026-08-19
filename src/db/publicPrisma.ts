import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/public-client/client";
import { env } from "../config/env";

const pool = new Pool({ connectionString: env.PUBLIC_DATABASE_URL, max: 10 });
const adapter = new PrismaPg(pool);

export const publicPrisma = new PrismaClient({ adapter });
