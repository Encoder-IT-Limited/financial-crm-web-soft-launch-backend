import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./common/logger";
import { closeAllTenantClients } from "./db/tenantClientCache";
import { publicPrisma } from "./db/publicPrisma";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT} (root domain: ${env.ROOT_DOMAIN})`);
});

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down`);
  server.close(async () => {
    await closeAllTenantClients();
    await publicPrisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
