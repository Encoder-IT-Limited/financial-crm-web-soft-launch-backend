import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireTenantWritable } from "../../middlewares/requireTenantWritable";
import { requireRole } from "../../middlewares/requireRole";
import * as c from "./inventory.controller";

export const inventoryRouter: Router = Router();

inventoryRouter.use(authenticate);

inventoryRouter.get("/categories", c.listCategoriesHandler);
inventoryRouter.post("/categories", requireTenantWritable, c.createCategoryHandler);

inventoryRouter.get("/units", c.listUnitsHandler);
inventoryRouter.post("/units", requireTenantWritable, c.createUnitHandler);

inventoryRouter.get("/products", c.listProductsHandler);
inventoryRouter.get("/products/lookup", c.lookupProductByBarcodeHandler);
inventoryRouter.post("/products", requireTenantWritable, c.createProductHandler);
inventoryRouter.get("/products/:id", c.getProductHandler);
inventoryRouter.patch("/products/:id", requireTenantWritable, c.updateProductHandler);

inventoryRouter.get("/warehouses", c.listWarehousesHandler);
inventoryRouter.post("/warehouses", requireTenantWritable, c.createWarehouseHandler);
inventoryRouter.get("/warehouses/:id", c.getWarehouseHandler);

inventoryRouter.get("/stock", c.listStockHandler);
inventoryRouter.get("/movements", c.listMovementsHandler);
inventoryRouter.get("/batches", c.listBatchesHandler);
inventoryRouter.post("/stock/receive", requireTenantWritable, c.receiveStockHandler);
inventoryRouter.post("/stock/issue", requireTenantWritable, c.issueStockHandler);
inventoryRouter.post(
  "/stock/adjust",
  requireTenantWritable,
  requireRole("OWNER", "MANAGER"),
  c.adjustStockHandler,
);
inventoryRouter.post(
  "/stock/write-off-damaged",
  requireTenantWritable,
  requireRole("OWNER", "MANAGER"),
  c.writeOffDamagedHandler,
);

inventoryRouter.post("/transfers", requireTenantWritable, c.requestTransferHandler);
inventoryRouter.get("/transfers", c.listTransfersHandler);
inventoryRouter.post(
  "/transfers/:id/approve",
  requireTenantWritable,
  requireRole("OWNER", "MANAGER"),
  c.approveTransferHandler,
);
inventoryRouter.post("/transfers/:id/dispatch", requireTenantWritable, c.dispatchTransferHandler);
inventoryRouter.post("/transfers/:id/receive", requireTenantWritable, c.receiveTransferHandler);
