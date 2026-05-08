import type { FilamentSpool, Product, SaleEntry } from '../types';

export function filamentCostPerG(spool: FilamentSpool): number {
  return spool.weightTotalG > 0 ? spool.costPerSpool / spool.weightTotalG : 0;
}

export function unitCost(product: Product, spools: FilamentSpool[]): number {
  const spool = spools.find((s) => s.id === product.filamentSpoolId);
  const filament = spool ? filamentCostPerG(spool) * product.filamentUsedG : 0;
  const labor = product.laborHours * product.laborRatePerHour;
  return filament + labor + product.otherCosts;
}

export function unitProfit(product: Product, spools: FilamentSpool[]): number {
  return product.sellingPrice - unitCost(product, spools);
}

export function unitMarginPct(product: Product, spools: FilamentSpool[]): number {
  return product.sellingPrice > 0
    ? (unitProfit(product, spools) / product.sellingPrice) * 100
    : 0;
}

interface KPIs {
  totalRevenue: number;
  netProfit: number;
  avgMarginPct: number;
  totalOrders: number;
  filamentValue: number;
  lowSpools: FilamentSpool[];
}

export function computeKPIs(
  sales: SaleEntry[],
  products: Product[],
  spools: FilamentSpool[]
): KPIs {
  let totalRevenue = 0;
  let totalCost = 0;
  let totalOrders = 0;

  for (const sale of sales) {
    const product = products.find((p) => p.id === sale.productId);
    if (!product) continue;
    const revenue = sale.salePrice * sale.quantity;
    const cost = unitCost(product, spools) * sale.quantity;
    totalRevenue += revenue;
    totalCost += cost;
    totalOrders += sale.quantity;
  }

  const netProfit = totalRevenue - totalCost;
  const avgMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const filamentValue = spools.reduce(
    (sum, s) => sum + filamentCostPerG(s) * s.weightRemainingG,
    0
  );
  const lowSpools = spools.filter(
    (s) => s.weightTotalG > 0 && s.weightRemainingG / s.weightTotalG < 0.2
  );

  return { totalRevenue, netProfit, avgMarginPct, totalOrders, filamentValue, lowSpools };
}

export interface MonthlyRevenue {
  month: string; // "Jan", "Feb", ...
  revenue: number;
  profit: number;
}

export function monthlyRevenueChart(
  sales: SaleEntry[],
  products: Product[],
  spools: FilamentSpool[],
  months = 6
): MonthlyRevenue[] {
  const now = new Date();
  const result: MonthlyRevenue[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString('default', { month: 'short' });
    const year = d.getFullYear();
    const month = d.getMonth();

    let revenue = 0;
    let profit = 0;
    for (const sale of sales) {
      const sd = new Date(sale.soldAt);
      if (sd.getFullYear() !== year || sd.getMonth() !== month) continue;
      const product = products.find((p) => p.id === sale.productId);
      if (!product) continue;
      const rev = sale.salePrice * sale.quantity;
      const cost = unitCost(product, spools) * sale.quantity;
      revenue += rev;
      profit += rev - cost;
    }
    result.push({ month: label, revenue, profit });
  }
  return result;
}

export interface TopProduct {
  name: string;
  sku: string;
  revenue: number;
  profit: number;
  units: number;
  marginPct: number;
}

export function topProducts(
  sales: SaleEntry[],
  products: Product[],
  spools: FilamentSpool[],
  limit = 5
): TopProduct[] {
  const map = new Map<string, TopProduct>();

  for (const sale of sales) {
    const product = products.find((p) => p.id === sale.productId);
    if (!product) continue;
    const rev = sale.salePrice * sale.quantity;
    const cost = unitCost(product, spools) * sale.quantity;
    const existing = map.get(product.id) ?? {
      name: product.name,
      sku: product.sku,
      revenue: 0,
      profit: 0,
      units: 0,
      marginPct: 0,
    };
    existing.revenue += rev;
    existing.profit += rev - cost;
    existing.units += sale.quantity;
    map.set(product.id, existing);
  }

  return [...map.values()]
    .map((p) => ({ ...p, marginPct: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}
