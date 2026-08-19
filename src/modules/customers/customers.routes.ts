import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantWritable } from "../../middleware/requireTenantWritable";
import { listCustomersHandler, createCustomerHandler } from "./customers.controller";

export const customersRouter: Router = Router();

customersRouter.get("/", authenticate, listCustomersHandler);
customersRouter.post("/", authenticate, requireTenantWritable, createCustomerHandler);
