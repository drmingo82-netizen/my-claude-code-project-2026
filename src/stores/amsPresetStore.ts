import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AmsPreset } from '../types';

interface AmsPresetStore {
  presets: AmsPreset[];
  addPreset: (preset: Omit<AmsPreset, 'id'>) => void;
  deletePreset: (id: string) => void;
}

export const useAmsPresetStore = create<AmsPresetStore>()(
  persist(
    (set) => ({
      presets: [],
      addPreset: (preset) =>
        set((s) => ({
          presets: [...s.presets, { ...preset, id: crypto.randomUUID() }],
        })),
      deletePreset: (id) =>
        set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
    }),
    { name: 'tactile-ams-presets' }
  )
);
