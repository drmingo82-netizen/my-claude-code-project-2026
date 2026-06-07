import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Printer3D, AMSSystem, BuildPlate } from '../types';

interface HardwareStore {
  printers: Printer3D[];
  amsSystems: AMSSystem[];
  buildPlates: BuildPlate[];

  addPrinter: (p: Omit<Printer3D, 'id'>) => void;
  updatePrinter: (id: string, p: Partial<Printer3D>) => void;
  deletePrinter: (id: string) => void;

  addAms: (a: Omit<AMSSystem, 'id'>) => void;
  updateAms: (id: string, a: Partial<AMSSystem>) => void;
  deleteAms: (id: string) => void;

  addPlate: (p: Omit<BuildPlate, 'id'>) => void;
  updatePlate: (id: string, p: Partial<BuildPlate>) => void;
  deletePlate: (id: string) => void;
}

export const useHardwareStore = create<HardwareStore>()(
  persist(
    (set) => ({
      printers: [],
      amsSystems: [],
      buildPlates: [],

      addPrinter: (p) =>
        set((s) => ({ printers: [...s.printers, { ...p, id: crypto.randomUUID() }] })),
      updatePrinter: (id, p) =>
        set((s) => ({ printers: s.printers.map((r) => (r.id === id ? { ...r, ...p } : r)) })),
      deletePrinter: (id) =>
        set((s) => ({
          printers: s.printers.filter((r) => r.id !== id),
          amsSystems: s.amsSystems.map((a) =>
            a.linkedPrinterId === id ? { ...a, linkedPrinterId: undefined } : a,
          ),
          buildPlates: s.buildPlates.map((b) =>
            b.linkedPrinterId === id ? { ...b, linkedPrinterId: undefined } : b,
          ),
        })),

      addAms: (a) =>
        set((s) => ({ amsSystems: [...s.amsSystems, { ...a, id: crypto.randomUUID() }] })),
      updateAms: (id, a) =>
        set((s) => ({ amsSystems: s.amsSystems.map((r) => (r.id === id ? { ...r, ...a } : r)) })),
      deleteAms: (id) =>
        set((s) => ({ amsSystems: s.amsSystems.filter((r) => r.id !== id) })),

      addPlate: (p) =>
        set((s) => ({ buildPlates: [...s.buildPlates, { ...p, id: crypto.randomUUID() }] })),
      updatePlate: (id, p) =>
        set((s) => ({ buildPlates: s.buildPlates.map((r) => (r.id === id ? { ...r, ...p } : r)) })),
      deletePlate: (id) =>
        set((s) => ({ buildPlates: s.buildPlates.filter((r) => r.id !== id) })),
    }),
    { name: 'tactile-hardware' }
  )
);
