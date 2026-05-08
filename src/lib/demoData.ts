import type { FilamentSpool, Product, SaleEntry } from '../types';

export const demoSpools: FilamentSpool[] = [
  { id: 's1', brand: 'Hatchbox', material: 'PLA', color: 'Black', weightTotalG: 1000, weightRemainingG: 340, costPerSpool: 22.99, purchasedAt: '2026-01-10' },
  { id: 's2', brand: 'eSUN', material: 'PETG', color: 'Clear', weightTotalG: 1000, weightRemainingG: 820, costPerSpool: 24.99, purchasedAt: '2026-02-05' },
  { id: 's3', brand: 'Bambu', material: 'PLA', color: 'White', weightTotalG: 1000, weightRemainingG: 90, costPerSpool: 19.99, purchasedAt: '2026-03-01' },
  { id: 's4', brand: 'Polymaker', material: 'TPU', color: 'Red', weightTotalG: 750, weightRemainingG: 600, costPerSpool: 27.99, purchasedAt: '2026-03-15' },
];

export const demoProducts: Product[] = [
  { id: 'p1', sku: 'TC-001', name: 'Cable Management Clips', category: 'Organization', filamentSpoolId: 's1', filamentUsedG: 18, printTimeHours: 1.5, laborHours: 0.25, laborRatePerHour: 20, otherCosts: 0.50, sellingPrice: 8.99 },
  { id: 'p2', sku: 'TC-002', name: 'Desk Phone Stand', category: 'Desk Accessories', filamentSpoolId: 's2', filamentUsedG: 65, printTimeHours: 4, laborHours: 0.5, laborRatePerHour: 20, otherCosts: 1.00, sellingPrice: 24.99 },
  { id: 'p3', sku: 'TC-003', name: 'Succulent Planter', category: 'Home Decor', filamentSpoolId: 's3', filamentUsedG: 80, printTimeHours: 5, laborHours: 0.5, laborRatePerHour: 20, otherCosts: 1.50, sellingPrice: 18.99 },
  { id: 'p4', sku: 'TC-004', name: 'Flexi Octopus', category: 'Toys', filamentSpoolId: 's4', filamentUsedG: 45, printTimeHours: 3, laborHours: 0.25, laborRatePerHour: 20, otherCosts: 0.75, sellingPrice: 14.99 },
  { id: 'p5', sku: 'TC-005', name: 'Wall-Mount Headphone Hook', category: 'Desk Accessories', filamentSpoolId: 's1', filamentUsedG: 30, printTimeHours: 2, laborHours: 0.25, laborRatePerHour: 20, otherCosts: 0.50, sellingPrice: 12.99 },
];

function isoDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export const demoSales: SaleEntry[] = [
  { id: 'sl1',  productId: 'p1', quantity: 3, salePrice: 8.99,  soldAt: isoDate(130), platform: 'Etsy' },
  { id: 'sl2',  productId: 'p3', quantity: 2, salePrice: 18.99, soldAt: isoDate(125), platform: 'Etsy' },
  { id: 'sl3',  productId: 'p2', quantity: 1, salePrice: 24.99, soldAt: isoDate(118), platform: 'Local' },
  { id: 'sl4',  productId: 'p4', quantity: 4, salePrice: 14.99, soldAt: isoDate(110), platform: 'Etsy' },
  { id: 'sl5',  productId: 'p5', quantity: 2, salePrice: 12.99, soldAt: isoDate(100), platform: 'Etsy' },
  { id: 'sl6',  productId: 'p1', quantity: 5, salePrice: 8.99,  soldAt: isoDate(90),  platform: 'Etsy' },
  { id: 'sl7',  productId: 'p2', quantity: 2, salePrice: 24.99, soldAt: isoDate(85),  platform: 'Local' },
  { id: 'sl8',  productId: 'p3', quantity: 3, salePrice: 18.99, soldAt: isoDate(75),  platform: 'Etsy' },
  { id: 'sl9',  productId: 'p4', quantity: 6, salePrice: 14.99, soldAt: isoDate(65),  platform: 'Etsy' },
  { id: 'sl10', productId: 'p5', quantity: 4, salePrice: 12.99, soldAt: isoDate(55),  platform: 'Etsy' },
  { id: 'sl11', productId: 'p1', quantity: 8, salePrice: 8.99,  soldAt: isoDate(45),  platform: 'Etsy' },
  { id: 'sl12', productId: 'p2', quantity: 3, salePrice: 24.99, soldAt: isoDate(38),  platform: 'Local' },
  { id: 'sl13', productId: 'p3', quantity: 4, salePrice: 18.99, soldAt: isoDate(30),  platform: 'Etsy' },
  { id: 'sl14', productId: 'p4', quantity: 5, salePrice: 14.99, soldAt: isoDate(22),  platform: 'Etsy' },
  { id: 'sl15', productId: 'p5', quantity: 6, salePrice: 12.99, soldAt: isoDate(15),  platform: 'Etsy' },
  { id: 'sl16', productId: 'p1', quantity: 10, salePrice: 8.99, soldAt: isoDate(8),   platform: 'Etsy' },
  { id: 'sl17', productId: 'p2', quantity: 2,  salePrice: 24.99, soldAt: isoDate(5),  platform: 'Local' },
  { id: 'sl18', productId: 'p3', quantity: 3,  salePrice: 18.99, soldAt: isoDate(2),  platform: 'Etsy' },
];
