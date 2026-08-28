import express from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { logger } from "./utils/logger";
import { publicPrisma } from "./db/publicPrisma";
import { tenantResolver } from "./middlewares/tenantResolver";
import { errorHandler } from "./middlewares/errorHandler";
import { envelopeResponse } from "./middlewares/envelopeResponse";
import { csrfGuard } from "./middlewares/csrf";

import { authRouter, publicPlansRouter } from "./modules/auth/auth.routes";
import { authenticateAny } from "./middlewares/authenticate";
import { meHandler } from "./modules/auth/auth.controller";

import { tenantRouter } from "./modules/tenants/tenants.public.routes";
import { tenantProfileRouter } from "./modules/tenants/tenants.profile.routes";
import { adminTenantsRouter } from "./modules/tenants/tenants.routes";
import { adminPlansRouter } from "./modules/plans/plans.routes";
import { adminPaymentsRouter } from "./modules/payments/payments.routes";
import { adminAuditRouter } from "./modules/audit/audit.routes";
import { adminSettingsRouter, publicSettingsRouter } from "./modules/settings/settings.routes";
import { adminDashboardRouter } from "./modules/dashboard/dashboard.routes";
import { publicContactRouter } from "./modules/contact/contact.routes";

import { customersRouter } from "./modules/customers/customers.routes";
import { inventoryRouter } from "./modules/inventory/inventory.routes";
import { invoicingRouter } from "./modules/invoicing/invoicing.routes";
import { proposalsRouter } from "./modules/proposals/proposals.routes";
import { retainersRouter } from "./modules/retainers/retainers.routes";
import { procurementRouter } from "./modules/procurement/procurement.routes";
import { posRouter } from "./modules/pos/pos.routes";
import { usersRouter } from "./modules/users/users.routes";

export function createApp() {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(envelopeResponse);
  app.use(csrfGuard);
  app.use(tenantResolver);

  const v1 = express.Router();

  v1.get("/health", async (_req, res, next) => {
    try {
      await publicPrisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", phase: 1 });
    } catch (err) {
      next(err);
    }
  });

  v1.use("/auth", authRouter);
  v1.get("/me", authenticateAny, meHandler);
  v1.use("/plans", publicPlansRouter);
  v1.use("/settings", publicSettingsRouter);
  v1.use("/contact", publicContactRouter);

  v1.use("/admin/dashboard", adminDashboardRouter);
  v1.use("/admin/tenants", adminTenantsRouter);
  v1.use("/admin/plans", adminPlansRouter);
  v1.use("/admin/payments", adminPaymentsRouter);
  v1.use("/admin/audit", adminAuditRouter);
  v1.use("/admin/settings", adminSettingsRouter);

  v1.use("/platform/tenants", tenantRouter);
  v1.use("/tenant", tenantProfileRouter);
  v1.use("/users", usersRouter);
  v1.use("/customers", customersRouter);
  v1.use("/inventory", inventoryRouter);
  v1.use(invoicingRouter);
  v1.use("/proposals", proposalsRouter);
  v1.use("/retainers", retainersRouter);
  v1.use("/procurement", procurementRouter);
  v1.use("/pos", posRouter);

  app.use("/api/v1", v1);
  app.use("/api", v1);

  app.use(errorHandler);
  return app;
}
