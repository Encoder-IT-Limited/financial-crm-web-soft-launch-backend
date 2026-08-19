import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantWritable } from "../../middleware/requireTenantWritable";
import { requireRole } from "../../middleware/requireRole";
import * as c from "./inventory.controller";

export const inventoryRouter: Router = Router();

inventoryRouter.use(authenticate);

inventoryRouter.get("/categories", c.listCategoriesHandler);
inventoryRouter.post("/categories", requireTenantWritable, c.createCategoryHandler);

inventoryRouter.get("/units", c.listUnitsHandler);
inventoryRouter.post("/units", requireTenantWritable, c.createUnitHandler);

inventoryRouter.get("/products", c.listProductsHandler);
inventoryRouter.post("/products", requireTenantWritable, c.createProductHandler);

inventoryRouter.get("/warehouses", c.listWarehousesHandler);
inventoryRouter.post("/warehouses", requireTenantWritable, c.createWarehouseHandler);

inventoryRouter.post("/stock/receive", requireTenantWritable, c.receiveStockHandler);
inventoryRouter.post("/stock/issue", requireTenantWritable, c.issueStockHandler);
inventoryRouter.post(
  "/stock/adjust",
  requireTenantWritable,
  requireRole("OWNER", "MANAGER"),
  c.adjustStockHandler,
);

inventoryRouter.post("/transfers", requireTenantWritable, c.requestTransferHandler);
inventoryRouter.post(
  "/transfers/:id/approve",
  requireTenantWritable,
  requireRole("OWNER", "MANAGER"),
  c.approveTransferHandler,
);
inventoryRouter.post("/transfers/:id/dispatch", requireTenantWritable, c.dispatchTransferHandler);
inventoryRouter.post("/transfers/:id/receive", requireTenantWritable, c.receiveTransferHandler);
