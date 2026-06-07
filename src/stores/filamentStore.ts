import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FilamentSpool } from '../types';

export interface AmsMapping {
  printerId: string; // which printer this slot belongs to
  amsSlot: number;   // 0-3 for AMS trays
  spoolId: string;   // id from FilamentSpool
}

interface FilamentStore {
  spools: FilamentSpool[];
  amsMappings: AmsMapping[];
  addSpool: (spool: Omit<FilamentSpool, 'id'>) => void;
  updateSpool: (id: string, spool: Partial<FilamentSpool>) => void;
  deleteSpool: (id: string) => void;
  importSpools: (spools: FilamentSpool[]) => void;
  clearLocationFromSpools: (locationId: string) => void;
  setAmsMapping: (printerId: string, amsSlot: number, spoolId: string) => void;
  clearAmsMapping: (printerId: string, amsSlot: number) => void;
}

export const useFilamentStore = create<FilamentStore>()(
  persist(
    (set) => ({
      spools: [],
      amsMappings: [],
      addSpool: (spool) =>
        set((s) => ({
          spools: [...s.spools, { ...spool, id: crypto.randomUUID() }],
        })),
      updateSpool: (id, spool) =>
        set((s) => ({
          spools: s.spools.map((sp) => (sp.id === id ? { ...sp, ...spool } : sp)),
        })),
      deleteSpool: (id) =>
        set((s) => ({
          spools: s.spools.filter((sp) => sp.id !== id),
          // clean up any mapping pointing to the deleted spool
          amsMappings: s.amsMappings.filter((m) => m.spoolId !== id),
        })),
      importSpools: (spools) => set({ spools }),
      clearLocationFromSpools: (locationId) =>
        set((s) => ({
          spools: s.spools.map((sp) =>
            sp.locationId === locationId ? { ...sp, locationId: undefined } : sp,
          ),
        })),
      setAmsMapping: (printerId, amsSlot, spoolId) =>
        set((s) => {
          const rest = s.amsMappings.filter(
            (m) => !(m.printerId === printerId && m.amsSlot === amsSlot)
          );
          return { amsMappings: spoolId ? [...rest, { printerId, amsSlot, spoolId }] : rest };
        }),
      clearAmsMapping: (printerId, amsSlot) =>
        set((s) => ({
          amsMappings: s.amsMappings.filter(
            (m) => !(m.printerId === printerId && m.amsSlot === amsSlot)
          ),
        })),
    }),
    { name: 'tactile-filament' }
  )
);
