import { describe, it, expect, vi } from "vitest";
import { isLowStock, isUuid, suggestedReorderQuantity, compactQuery } from "../inventory.helpers";
import * as inventoryService from "../inventory.service";

describe("inventory helpers", () => {
  it("accepts UUID strings and rejects free text", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuid("foo")).toBe(false);
    expect(isUuid("550e8400e29b41d4a716446655440000")).toBe(false);
  });

  it("matches the frontend reorder heuristic", () => {
    expect(suggestedReorderQuantity(10, 3)).toBe(17);
    expect(suggestedReorderQuantity(0, 0)).toBe(1);
  });

  it("flags active products at or below max(reorder, min)", () => {
    expect(isLowStock("ACTIVE", 5, 10, 2)).toBe(true);
    expect(isLowStock("ACTIVE", 11, 10, 2)).toBe(false);
    expect(isLowStock("INACTIVE", 0, 10, 2)).toBe(false);
  });

  it("strips empty query strings", () => {
    expect(compactQuery({ search: "foo", status: "", warehouseId: undefined })).toEqual({ search: "foo" });
  });
});

describe("getWarehouse", () => {
  it("includes products and damaged/reserved totals", async () => {
    const tenantPrisma = {
      warehouse: {
        findUnique: vi.fn().mockResolvedValue({
          id: "wh-1",
          name: "Main",
          code: "WH-01",
          address: "Dubai",
          status: "ACTIVE",
        }),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([
          {
            productId: "p-1",
            quantity: 10,
            damagedQuantity: 2,
            reservedQuantity: 1,
            averageCost: 5,
            product: { name: "USB Cable", sku: "ELEC-001", barcode: "123", status: "ACTIVE" },
          },
          {
            productId: "p-2",
            quantity: 0,
            damagedQuantity: 0,
            reservedQuantity: 0,
            averageCost: 0,
            product: { name: "Empty", sku: "E-0", barcode: null, status: "ACTIVE" },
          },
        ]),
      },
    };

    const dto = await inventoryService.getWarehouse(tenantPrisma as never, "wh-1");
    expect(dto?.totalOnHand).toBe(10);
    expect(dto?.totalDamaged).toBe(2);
    expect(dto?.totalReserved).toBe(1);
    expect(dto?.productCount).toBe(1);
    expect(dto?.products).toHaveLength(1);
    expect(dto?.products?.[0]).toMatchObject({ productId: "p-1", sku: "ELEC-001", quantity: 10, damagedQuantity: 2 });
  });
});

describe("listTransfers search", () => {
  it("does not assign a non-UUID search to transfer id", async () => {
    const tenantPrisma = {
      warehouse: { findMany: vi.fn().mockResolvedValue([{ id: "wh-1" }]) },
      product: { findMany: vi.fn().mockResolvedValue([]) },
      stockTransfer: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    await inventoryService.listTransfers(tenantPrisma as never, { search: "foo" });
    expect(tenantPrisma.stockTransfer.findMany).toHaveBeenCalled();
    const where = tenantPrisma.stockTransfer.findMany.mock.calls[0][0].where;
    expect(where.id).toBeUndefined();
    expect(where.OR).toEqual([
      { fromWarehouseId: { in: ["wh-1"] } },
      { toWarehouseId: { in: ["wh-1"] } },
    ]);
  });

  it("uses exact id when search is a UUID", async () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const tenantPrisma = {
      warehouse: { findMany: vi.fn() },
      product: { findMany: vi.fn() },
      stockTransfer: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    await inventoryService.listTransfers(tenantPrisma as never, { search: id });
    const where = tenantPrisma.stockTransfer.findMany.mock.calls[0][0].where;
    expect(where.id).toBe(id);
    expect(tenantPrisma.warehouse.findMany).not.toHaveBeenCalled();
  });
});

describe("adjustStock", () => {
  it("persists the note on the adjustment movement", async () => {
    const create = vi.fn().mockResolvedValue({ id: "m-1" });
    const tenantPrisma = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          stockBalance: {
            findUnique: vi.fn().mockResolvedValue({ quantity: 4, averageCost: 2, damagedQuantity: 0 }),
            upsert: vi.fn().mockResolvedValue({ quantity: 6 }),
          },
          stockMovement: { create },
        }),
    };

    await inventoryService.adjustStock(
      tenantPrisma as never,
      "tenant-1",
      { productId: "p-1", warehouseId: "wh-1", quantityDelta: 2, note: "Cycle count" },
      "user-1",
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: "ADJUSTMENT",
          quantity: 2,
          note: "Cycle count",
        }),
      }),
    );
  });
});

describe("dashboard / reorder / valuation", () => {
  it("computes WAC stock value and inbound/adjustment counts", async () => {
    const tenantPrisma = {
      product: {
        count: vi.fn().mockResolvedValue(3),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "p-1",
            name: "USB",
            sku: "E-1",
            reorderLevel: 10,
            minimumStock: 2,
            stockBalances: [{ quantity: 1 }],
          },
        ]),
      },
      warehouse: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([{ id: "wh-1", name: "Main" }]),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([
          { warehouseId: "wh-1", quantity: 4, damagedQuantity: 1, averageCost: 2.5 },
        ]),
      },
      stockMovement: {
        count: vi.fn().mockImplementation(({ where }: { where: { movementType: unknown } }) => {
          if (where.movementType === "ADJUSTMENT") return Promise.resolve(7);
          return Promise.resolve(9);
        }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "m-1",
            movementDate: new Date("2026-01-01T00:00:00.000Z"),
            movementType: "ADJUSTMENT",
            quantity: -1,
            productId: "p-1",
            warehouseId: "wh-1",
          },
        ]),
      },
    };

    const dash = await inventoryService.getDashboard(tenantPrisma as never);
    expect(dash.productCount).toBe(3);
    expect(dash.stockValue).toBe(10);
    expect(dash.adjustmentCount).toBe(7);
    expect(dash.inboundCount).toBe(9);
    expect(dash.stockValueByWarehouse[0]).toMatchObject({ warehouseId: "wh-1", value: 10, onHand: 4, damagedOnHand: 1 });
    expect(dash.lowStock[0]).toMatchObject({ productId: "p-1", stock: 1 });
    expect(dash.recentMovements[0].productName).toBe("USB");
  });

  it("returns suggested reorder qty from the heuristic", async () => {
    const tenantPrisma = {
      product: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "p-1",
            name: "USB",
            sku: "E-1",
            reorderLevel: 10,
            minimumStock: 2,
            maximumStock: 100,
            costPrice: 3,
            stockBalances: [{ quantity: 3 }],
          },
        ]),
      },
    };
    const items = await inventoryService.listReorder(tenantPrisma as never);
    expect(items).toHaveLength(1);
    expect(items[0].suggestedQuantity).toBe(17);
    expect(items[0].costPrice).toBe(3);
  });

  it("values rows as quantity × averageCost", async () => {
    const tenantPrisma = {
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([
          { productId: "p-1", warehouseId: "wh-1", quantity: 4, averageCost: 2.5 },
        ]),
      },
      product: { findMany: vi.fn().mockResolvedValue([{ id: "p-1", sku: "E-1", name: "USB" }]) },
      warehouse: { findMany: vi.fn().mockResolvedValue([{ id: "wh-1", name: "Main" }]) },
    };
    const valuation = await inventoryService.getValuation(tenantPrisma as never);
    expect(valuation.method).toBe("WEIGHTED_AVERAGE");
    expect(valuation.totalValue).toBe(10);
    expect(valuation.rows[0]).toMatchObject({ sku: "E-1", warehouseName: "Main", value: 10 });
  });
});
