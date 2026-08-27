import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireTenantWritable } from "../../middlewares/requireTenantWritable";
import {
  listCustomersHandler,
  createCustomerHandler,
  getCustomerHandler,
  getCustomerStatementHandler,
  updateCustomerHandler,
  deleteCustomerHandler,
} from "./customers.controller";

export const customersRouter: Router = Router();

customersRouter.use(authenticate);
customersRouter.get("/", listCustomersHandler);
customersRouter.post("/", requireTenantWritable, createCustomerHandler);
customersRouter.get("/:id/statement", getCustomerStatementHandler);
customersRouter.get("/:id", getCustomerHandler);
customersRouter.patch("/:id", requireTenantWritable, updateCustomerHandler);
customersRouter.delete("/:id", requireTenantWritable, deleteCustomerHandler);
