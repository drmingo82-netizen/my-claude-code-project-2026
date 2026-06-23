import { create } from 'zustand';
import type { FilamentSpool } from '../types';

export interface AmsMapping {
  printerId: string;
  amsSlot: number;
  spoolId: string;
  assignedAt?: string;
}

const SERVER_URL =
  (import.meta.env.VITE_PRINTER_SERVER_URL as string | undefined) ?? 'http://localhost:3001';

const api = {
  get:    () => fetch(`${SERVER_URL}/api/filaments`).then(r => r.json()),
  add:    (spool: Omit<FilamentSpool, 'id'>) =>
    fetch(`${SERVER_URL}/api/filaments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spool) }),
  update: (id: string, spool: Partial<FilamentSpool>) =>
    fetch(`${SERVER_URL}/api/filaments/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spool) }),
  remove: (id: string) =>
    fetch(`${SERVER_URL}/api/filaments/${id}`, { method: 'DELETE' }),
  import: (spools: FilamentSpool[]) =>
    fetch(`${SERVER_URL}/api/filaments/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spools) }),
  syncMappings: (mappings: AmsMapping[]) =>
    fetch(`${SERVER_URL}/api/filaments/ams-mappings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mappings) }),
};

interface FilamentStore {
  spools: FilamentSpool[];
  amsMappings: AmsMapping[];
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  addSpool: (spool: Omit<FilamentSpool, 'id'>) => void;
  updateSpool: (id: string, spool: Partial<FilamentSpool>) => void;
  deleteSpool: (id: string) => void;
  importSpools: (spools: FilamentSpool[]) => void;
  clearLocationFromSpools: (locationId: string) => void;
  setAmsMapping: (printerId: string, amsSlot: number, spoolId: string) => void;
  clearAmsMapping: (printerId: string, amsSlot: number) => void;
  markNfcProgrammed: (id: string) => void;
}

export const useFilamentStore = create<FilamentStore>()((set, get) => ({
  spools: [],
  amsMappings: [],
  isHydrated: false,

  hydrate: async () => {
    try {
      const data = await api.get();
      const serverSpools: FilamentSpool[] = Array.isArray(data.spools) ? data.spools : [];
      const serverMappings: AmsMapping[] = Array.isArray(data.amsMappings) ? data.amsMappings : [];

      // One-time migration: if server is empty, check localStorage for legacy data
      if (serverSpools.length === 0) {
        try {
          const raw = localStorage.getItem('tactile-filament');
          if (raw) {
            const parsed = JSON.parse(raw);
            const localSpools: FilamentSpool[] = parsed?.state?.spools ?? [];
            const localMappings: AmsMapping[] = parsed?.state?.amsMappings ?? [];
            if (localSpools.length > 0) {
              await api.import(localSpools);
              await api.syncMappings(localMappings);
              set({ spools: localSpools, amsMappings: localMappings, isHydrated: true });
              return;
            }
          }
        } catch {
          // localStorage migration failed — continue with empty state
        }
      }

      set({ spools: serverSpools, amsMappings: serverMappings, isHydrated: true });
    } catch {
      set({ isHydrated: true }); // don't block the UI if server is unreachable
    }
  },

  addSpool: (spool) => {
    const newSpool = { ...spool, id: crypto.randomUUID() };
    set(s => ({ spools: [...s.spools, newSpool] }));
    api.add(spool).catch(console.error);
  },

  updateSpool: (id, updates) => {
    set(s => ({
      spools: s.spools.map(sp => {
        if (sp.id !== id) return sp;
        const merged = { ...sp, ...updates };
        if ('weightRemainingG' in updates) {
          const threshold = merged.lowStockThresholdGrams ?? 100;
          if (merged.weightRemainingG > threshold) merged.lowStockAlertSent = false;
        }
        return merged;
      }),
    }));
    api.update(id, updates).catch(console.error);
  },

  deleteSpool: (id) => {
    set(s => ({
      spools: s.spools.filter(sp => sp.id !== id),
      amsMappings: s.amsMappings.filter(m => m.spoolId !== id),
    }));
    api.remove(id).catch(console.error);
  },

  importSpools: (spools) => {
    set({ spools });
    api.import(spools).catch(console.error);
  },

  clearLocationFromSpools: (locationId) => {
    set(s => ({
      spools: s.spools.map(sp =>
        sp.locationId === locationId ? { ...sp, locationId: undefined } : sp,
      ),
    }));
    // sync all affected spools
    const affected = get().spools.filter(sp => sp.locationId === locationId);
    affected.forEach(sp => api.update(sp.id, { ...sp, locationId: undefined }).catch(console.error));
  },

  setAmsMapping: (printerId, amsSlot, spoolId) => {
    set(s => {
      const rest = s.amsMappings.filter(
        m => !(m.printerId === printerId && m.amsSlot === amsSlot),
      );
      const next = spoolId
        ? [...rest, { printerId, amsSlot, spoolId, assignedAt: new Date().toISOString() }]
        : rest;
      api.syncMappings(next).catch(console.error);
      return { amsMappings: next };
    });
  },

  clearAmsMapping: (printerId, amsSlot) => {
    set(s => {
      const next = s.amsMappings.filter(
        m => !(m.printerId === printerId && m.amsSlot === amsSlot),
      );
      api.syncMappings(next).catch(console.error);
      return { amsMappings: next };
    });
  },

  markNfcProgrammed: (id) => {
    const updates = { nfcProgrammed: true, nfcProgrammedAt: new Date().toISOString() };
    set(s => ({
      spools: s.spools.map(sp => sp.id === id ? { ...sp, ...updates } : sp),
    }));
    api.update(id, updates).catch(console.error);
  },
}));
