export type ProductDto = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  unitId: string | null;
  unitName: string | null;
  unitSymbol: string | null;
  costPrice: number;
  sellingPrice: number;
  taxRate: number;
  minimumStock: number;
  maximumStock: number;
  reorderLevel: number;
  trackBatch: boolean;
  status: string;
  onHand: number;
  damagedOnHand: number;
  createdAt: string;
};

export type WarehouseProductDto = {
  productId: string;
  name: string;
  sku: string;
  barcode: string | null;
  status: string;
  quantity: number;
  damagedQuantity: number;
  reservedQuantity: number;
  averageCost: number;
};

export type WarehouseDto = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  status: string;
  productCount: number;
  totalOnHand: number;
  totalDamaged: number;
  totalReserved: number;
  products?: WarehouseProductDto[];
};

export type InventoryDashboardDto = {
  productCount: number;
  warehouseCount: number;
  stockValue: number;
  adjustmentCount: number;
  inboundCount: number;
  stockValueByWarehouse: {
    warehouseId: string;
    name: string;
    value: number;
    onHand: number;
    damagedOnHand: number;
  }[];
  recentMovements: {
    id: string;
    movementDate: string;
    movementType: string;
    quantity: number;
    productId: string;
    productName: string | null;
    warehouseId: string;
  }[];
  lowStock: {
    productId: string;
    name: string;
    sku: string;
    stock: number;
    reorderLevel: number;
    minimumStock: number;
  }[];
};

export type ReorderItemDto = {
  productId: string;
  name: string;
  sku: string;
  stock: number;
  reorderLevel: number;
  minimumStock: number;
  maximumStock: number;
  suggestedQuantity: number;
  costPrice: number;
};

export type ValuationDto = {
  method: "WEIGHTED_AVERAGE";
  totalValue: number;
  rows: {
    productId: string;
    sku: string;
    name: string;
    warehouseId: string;
    warehouseName: string;
    quantity: number;
    averageCost: number;
    value: number;
  }[];
};
