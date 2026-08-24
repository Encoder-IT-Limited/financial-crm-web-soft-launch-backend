import { Router } from "express";
import { createTenantHandler } from "./tenants.controller";

export const tenantRouter: Router = Router();

tenantRouter.post("/", createTenantHandler);
