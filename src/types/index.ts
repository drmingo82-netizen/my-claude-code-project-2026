export interface FilamentSpool {
  id: string;
  brand: string;
  material: string; // PLA, PETG, ABS, TPU, etc.
  color: string;
  weightTotalG: number;
  weightRemainingG: number;
  costPerSpool: number;
  purchasedAt: string; // ISO date
  notes?: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  filamentSpoolId?: string;
  filamentUsedG: number;
  printTimeHours: number;
  laborHours: number;
  laborRatePerHour: number;
  otherCosts: number; // packaging, supports, etc.
  sellingPrice: number;
  notes?: string;
}

export interface SaleEntry {
  id: string;
  productId: string;
  quantity: number;
  salePrice: number;
  soldAt: string; // ISO date
  platform: string; // Etsy, local, etc.
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export type OrderStatus = 'new' | 'printing' | 'printed' | 'shipped';

export interface Order {
  id: string;
  orderNumber: string;
  platform: string;
  customerName: string;
  status: OrderStatus;
  items: OrderItem[];
  shippingCost: number;
  platformFeePercent: number;
  notes: string;
  createdAt: string; // YYYY-MM-DD
}
