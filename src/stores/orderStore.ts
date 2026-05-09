import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Order } from '../types';

interface OrderStore {
  orders: Order[];
  addOrder: (order: Omit<Order, 'id'>) => void;
  updateOrder: (id: string, order: Partial<Order>) => void;
  deleteOrder: (id: string) => void;
}

export const useOrderStore = create<OrderStore>()(
  persist(
    (set) => ({
      orders: [],
      addOrder: (order) =>
        set((s) => ({
          orders: [...s.orders, { ...order, id: crypto.randomUUID() }],
        })),
      updateOrder: (id, order) =>
        set((s) => ({
          orders: s.orders.map((o) => (o.id === id ? { ...o, ...order } : o)),
        })),
      deleteOrder: (id) =>
        set((s) => ({ orders: s.orders.filter((o) => o.id !== id) })),
    }),
    { name: 'tactile-orders' }
  )
);
