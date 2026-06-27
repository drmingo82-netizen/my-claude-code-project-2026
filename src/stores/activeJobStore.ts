import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ActivePrintJob, UsageHistoryRecord } from '../types';
import { useFilamentStore } from './filamentStore';
import { useUsageHistoryStore } from './usageHistoryStore';
import { useNotificationStore } from './notificationStore';

interface ActiveJobStore {
  activeJobs: Record<string, ActivePrintJob>; // keyed by printerId

  startJob: (
    printerId: string,
    gcodeFile: string,
    spoolAssignments: Record<number, string>,
  ) => void;
  updateProgress: (printerId: string, pct: number) => void;
  /** Attach per-slot gram estimates after the job starts (from file parser). */
  setCalculatedGrams: (printerId: string, grams: Record<number, number>) => void;
  completeJob: (printerId: string) => void;
  cancelJob: (printerId: string, reason?: 'cancelled' | 'failed') => void;
}

/** Deduct grams * pct from each assigned spool and write history records. */
function deductAndLog(job: ActivePrintJob, pct: number): void {
  const { spools, updateSpool } = useFilamentStore.getState();
  const { addRecord } = useUsageHistoryStore.getState();
  const completedAt = new Date().toISOString();

  for (const [slotStr, rawGrams] of Object.entries(job.calculatedGrams)) {
    const slot = Number(slotStr);
    const grams = Math.round(rawGrams * pct * 10) / 10;
    if (grams <= 0) continue;

    const spoolId = job.spoolAssignments[slot];
    if (!spoolId) continue;

    const spool = spools.find((s) => s.id === spoolId);
    if (!spool) continue;

    const newRemaining = Math.max(0, Math.round((spool.weightRemainingG - grams) * 10) / 10);
    updateSpool(spoolId, { weightRemainingG: newRemaining });

    // Low-stock alert — fires once per fill, resets when weight rises above threshold
    const updated = useFilamentStore.getState().spools.find((s) => s.id === spoolId);
    if (updated) {
      const threshold = updated.lowStockThresholdGrams ?? 100;
      if (updated.weightRemainingG <= threshold && !updated.lowStockAlertSent) {
        updateSpool(spoolId, { lowStockAlertSent: true });
        useNotificationStore.getState().addToast(
          `Low stock: ${updated.brand} ${updated.material} ${updated.color} — ${updated.weightRemainingG}g remaining`,
        );
      }
    }

    const record: UsageHistoryRecord = {
      id: crypto.randomUUID(),
      spoolId,
      jobId: job.jobId,
      gcodeFile: job.gcodeFile,
      gramsUsed: grams,
      printerId: job.printerId,
      amsSlot: slot,
      completedAt,
      deductionType: pct < 1 ? 'partial' : 'automatic',
      ...(pct < 1 ? { completionPct: job.lastProgressPct } : {}),
    };
    addRecord(record);
  }
}

export const useActiveJobStore = create<ActiveJobStore>()(
  persist(
    (set, get) => ({
      activeJobs: {},

      startJob: (printerId, gcodeFile, spoolAssignments) => {
        const existing = get().activeJobs[printerId];
        if (existing?.status === 'running') return;
        const job: ActivePrintJob = {
          jobId: crypto.randomUUID(),
          printerId,
          gcodeFile,
          startedAt: new Date().toISOString(),
          calculatedGrams: {},
          spoolAssignments,
          lastProgressPct: 0,
          status: 'running',
        };
        set((s) => ({ activeJobs: { ...s.activeJobs, [printerId]: job } }));
      },

      updateProgress: (printerId, pct) =>
        set((s) => {
          const job = s.activeJobs[printerId];
          if (!job || job.status !== 'running') return s;
          return {
            activeJobs: { ...s.activeJobs, [printerId]: { ...job, lastProgressPct: pct } },
          };
        }),

      setCalculatedGrams: (printerId, grams) =>
        set((s) => {
          const job = s.activeJobs[printerId];
          if (job) {
            return {
              activeJobs: { ...s.activeJobs, [printerId]: { ...job, calculatedGrams: grams } },
            };
          }
          // No tracked job — e.g. the print was running through a server reconnect, so the
          // JobTracker never saw the IDLE→RUNNING transition. Create a minimal running job so
          // the uploaded estimate is stored (and can drive auto-deduction). Spool assignments
          // come from the current AMS mappings for this printer.
          const amsMappings = useFilamentStore.getState().amsMappings.filter(
            (m) => m.printerId === printerId,
          );
          const spoolAssignments: Record<number, string> = {};
          for (const m of amsMappings) spoolAssignments[m.amsSlot] = m.spoolId;
          const newJob: ActivePrintJob = {
            jobId: crypto.randomUUID(),
            printerId,
            gcodeFile: 'unknown',
            startedAt: new Date().toISOString(),
            calculatedGrams: grams,
            spoolAssignments,
            lastProgressPct: 0,
            status: 'running',
          };
          return { activeJobs: { ...s.activeJobs, [printerId]: newJob } };
        }),

      completeJob: (printerId) => {
        const job = get().activeJobs[printerId];
        if (!job || job.status !== 'running') return;
        deductAndLog(job, 1);
        set((s) => ({
          activeJobs: { ...s.activeJobs, [printerId]: { ...job, status: 'complete' } },
        }));
      },

      cancelJob: (printerId, reason = 'cancelled') => {
        const job = get().activeJobs[printerId];
        if (!job || job.status !== 'running') return;
        const pct = job.lastProgressPct / 100;
        if (pct > 0) deductAndLog(job, pct);
        set((s) => ({
          activeJobs: { ...s.activeJobs, [printerId]: { ...job, status: reason } },
        }));
      },
    }),
    {
      name: 'tactile-active-jobs',
      storage: createJSONStorage(() => localStorage),
      // Only persist jobs still running — completed/cancelled are dead state
      partialize: (state) => ({
        activeJobs: Object.fromEntries(
          Object.entries(state.activeJobs).filter(([, j]) => j.status === 'running'),
        ),
      }),
    }
  )
);
