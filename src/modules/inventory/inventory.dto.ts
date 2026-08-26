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

export type WarehouseDto = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  status: string;
  productCount: number;
  totalOnHand: number;
};
