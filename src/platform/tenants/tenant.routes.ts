import { Router } from "express";
import { createTenantHandler } from "./tenant.controller";

export const tenantRouter: Router = Router();

tenantRouter.post("/", createTenantHandler);
