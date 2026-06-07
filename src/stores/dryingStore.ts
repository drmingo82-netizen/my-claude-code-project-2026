import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActiveDryingTimer, DryingSession, FilamentDryer } from '../types';

interface DryingStore {
  activeTimers: ActiveDryingTimer[];
  sessions: DryingSession[];
  dryers: FilamentDryer[];

  startTimer: (timer: ActiveDryingTimer) => void;
  cancelTimer: (spoolId: string) => void;
  logSession: (spoolId: string) => void;

  addDryer: (dryer: Omit<FilamentDryer, 'id'>) => void;
  updateDryer: (id: string, dryer: Partial<FilamentDryer>) => void;
  deleteDryer: (id: string) => void;
}

export const useDryingStore = create<DryingStore>()(
  persist(
    (set, get) => ({
      activeTimers: [],
      sessions: [],
      dryers: [],

      startTimer: (timer) =>
        set((s) => ({
          // Replace if already running for this spool
          activeTimers: [
            ...s.activeTimers.filter((t) => t.spoolId !== timer.spoolId),
            timer,
          ],
        })),

      cancelTimer: (spoolId) =>
        set((s) => ({
          activeTimers: s.activeTimers.filter((t) => t.spoolId !== spoolId),
        })),

      logSession: (spoolId) => {
        const timer = get().activeTimers.find((t) => t.spoolId === spoolId);
        if (!timer) return;
        const session: DryingSession = {
          id: crypto.randomUUID(),
          spoolId: timer.spoolId,
          spoolLabel: timer.spoolLabel,
          startedAt: timer.startedAt,
          durationMinutes: timer.durationMinutes,
          tempC: timer.tempC,
          completedAt: new Date().toISOString(),
        };
        set((s) => ({
          activeTimers: s.activeTimers.filter((t) => t.spoolId !== spoolId),
          sessions: [session, ...s.sessions].slice(0, 200), // keep last 200
        }));
      },

      addDryer: (dryer) =>
        set((s) => ({
          dryers: [...s.dryers, { ...dryer, id: crypto.randomUUID() }],
        })),

      updateDryer: (id, dryer) =>
        set((s) => ({
          dryers: s.dryers.map((d) => (d.id === id ? { ...d, ...dryer } : d)),
        })),

      deleteDryer: (id) =>
        set((s) => ({
          dryers: s.dryers.filter((d) => d.id !== id),
          // Remove dryer link from any active timers
          activeTimers: s.activeTimers.map((t) =>
            t.dryerId === id ? { ...t, dryerId: undefined } : t,
          ),
        })),
    }),
    { name: 'tactile-drying' }
  )
);
