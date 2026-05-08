import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from '../types';

interface ProductStore {
  products: Product[];
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, product: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  importProducts: (products: Product[]) => void;
}

export const useProductStore = create<ProductStore>()(
  persist(
    (set) => ({
      products: [],
      addProduct: (product) =>
        set((s) => ({
          products: [...s.products, { ...product, id: crypto.randomUUID() }],
        })),
      updateProduct: (id, product) =>
        set((s) => ({
          products: s.products.map((p) => (p.id === id ? { ...p, ...product } : p)),
        })),
      deleteProduct: (id) =>
        set((s) => ({ products: s.products.filter((p) => p.id !== id) })),
      importProducts: (products) => set({ products }),
    }),
    { name: 'tactile-products' }
  )
);
