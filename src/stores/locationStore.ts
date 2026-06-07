import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StorageLocation } from '../types';

interface LocationStore {
  locations: StorageLocation[];
  addLocation: (loc: Omit<StorageLocation, 'id'>) => void;
  updateLocation: (id: string, loc: Partial<StorageLocation>) => void;
  deleteLocation: (id: string) => void;
}

export const useLocationStore = create<LocationStore>()(
  persist(
    (set) => ({
      locations: [],
      addLocation: (loc) =>
        set((s) => ({
          locations: [...s.locations, { ...loc, id: crypto.randomUUID() }],
        })),
      updateLocation: (id, loc) =>
        set((s) => ({
          locations: s.locations.map((l) => (l.id === id ? { ...l, ...loc } : l)),
        })),
      deleteLocation: (id) =>
        set((s) => ({ locations: s.locations.filter((l) => l.id !== id) })),
    }),
    { name: 'tactile-locations' }
  )
);
