import express from "express";
import pinoHttp from "pino-http";
import { logger } from "./common/logger";
import { publicPrisma } from "./db/publicPrisma";
import { tenantResolver } from "./middleware/tenantResolver";
import { errorHandler } from "./middleware/errorHandler";
import { tenantRouter } from "./platform/tenants/tenant.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { customersRouter } from "./modules/customers/customers.routes";
import { inventoryRouter } from "./modules/inventory/inventory.routes";
import { invoicingRouter } from "./modules/invoicing/invoicing.routes";
import { procurementRouter } from "./modules/procurement/procurement.routes";
import { posRouter } from "./modules/pos/pos.routes";

export function createApp() {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(express.json());

  app.get("/api/health", async (_req, res, next) => {
    try {
      await publicPrisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok" });
    } catch (err) {
      next(err);
    }
  });

  app.use(tenantResolver);

  app.use("/api/platform/tenants", tenantRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/customers", customersRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api", invoicingRouter);
  app.use("/api/procurement", procurementRouter);
  app.use("/api/pos", posRouter);

  app.use(errorHandler);

  return app;
}
