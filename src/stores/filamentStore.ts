import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FilamentSpool } from '../types';

interface FilamentStore {
  spools: FilamentSpool[];
  addSpool: (spool: Omit<FilamentSpool, 'id'>) => void;
  updateSpool: (id: string, spool: Partial<FilamentSpool>) => void;
  deleteSpool: (id: string) => void;
  importSpools: (spools: FilamentSpool[]) => void;
}

export const useFilamentStore = create<FilamentStore>()(
  persist(
    (set) => ({
      spools: [],
      addSpool: (spool) =>
        set((s) => ({
          spools: [...s.spools, { ...spool, id: crypto.randomUUID() }],
        })),
      updateSpool: (id, spool) =>
        set((s) => ({
          spools: s.spools.map((sp) => (sp.id === id ? { ...sp, ...spool } : sp)),
        })),
      deleteSpool: (id) =>
        set((s) => ({ spools: s.spools.filter((sp) => sp.id !== id) })),
      importSpools: (spools) => set({ spools }),
    }),
    { name: 'tactile-filament' }
  )
);
