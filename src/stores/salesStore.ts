import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SaleEntry } from '../types';

interface SalesStore {
  sales: SaleEntry[];
  addSale: (sale: Omit<SaleEntry, 'id'>) => void;
  updateSale: (id: string, sale: Partial<SaleEntry>) => void;
  deleteSale: (id: string) => void;
}

export const useSalesStore = create<SalesStore>()(
  persist(
    (set) => ({
      sales: [],
      addSale: (sale) =>
        set((s) => ({
          sales: [...s.sales, { ...sale, id: crypto.randomUUID() }],
        })),
      updateSale: (id, sale) =>
        set((s) => ({
          sales: s.sales.map((sl) => (sl.id === id ? { ...sl, ...sale } : sl)),
        })),
      deleteSale: (id) =>
        set((s) => ({ sales: s.sales.filter((sl) => sl.id !== id) })),
    }),
    { name: 'tactile-sales' }
  )
);
