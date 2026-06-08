import { useEffect, useRef } from 'react';
import { usePrinterStatus } from './usePrinterStatus';
import { useFilamentStore } from '../stores/filamentStore';
import { useActiveJobStore } from '../stores/activeJobStore';
import type { PrinterState } from './usePrinterStatus';

type GcodeState = PrinterState['gcodeState'];

/** States that represent a job in-flight (running or paused). */
const IN_PROGRESS: GcodeState[] = ['RUNNING', 'PAUSE'];

type PrevEntry = { gcodeState: GcodeState; progress: number };

/**
 * Watches printer state transitions (via polling) and drives the active-job
 * store lifecycle: start → progress → complete / cancel / fail.
 *
 * Mount once globally via <JobTracker /> in App.tsx.
 */
export function useJobTracker(): void {
  const { printers, serverOnline } = usePrinterStatus();
  const prevRef = useRef<Record<string, PrevEntry>>({});

  useEffect(() => {
    for (const printer of printers) {
      const prev = prevRef.current[printer.id];
      const curr = printer.printer;
      const currState = curr.gcodeState;
      const prevState: GcodeState = prev?.gcodeState ?? '';

      if (serverOnline) {
        // ── Job start: non-running → RUNNING ────────────────────────────────
        if (currState === 'RUNNING' && !IN_PROGRESS.includes(prevState)) {
          const amsMappings = useFilamentStore.getState().amsMappings.filter(
            (m) => m.printerId === printer.id,
          );
          const spoolAssignments: Record<number, string> = {};
          for (const m of amsMappings) {
            spoolAssignments[m.amsSlot] = m.spoolId;
          }
          useActiveJobStore.getState().startJob(
            printer.id,
            curr.currentFile ?? 'unknown',
            spoolAssignments,
          );
        }

        // ── Progress update ──────────────────────────────────────────────────
        if (currState === 'RUNNING' && curr.progress !== prev?.progress) {
          useActiveJobStore.getState().updateProgress(printer.id, curr.progress);
        }

        // ── Print finished ───────────────────────────────────────────────────
        if (currState === 'FINISH' && prevState !== 'FINISH') {
          useActiveJobStore.getState().completeJob(printer.id);
        }

        // ── Print failed ─────────────────────────────────────────────────────
        if (currState === 'FAILED' && prevState !== 'FAILED') {
          useActiveJobStore.getState().cancelJob(printer.id, 'failed');
        }

        // ── Went IDLE from in-progress without FINISH/FAILED → user cancelled
        if (currState === 'IDLE' && IN_PROGRESS.includes(prevState)) {
          useActiveJobStore.getState().cancelJob(printer.id, 'cancelled');
        }
      }

      // Always advance prevRef so transitions stay accurate when server reconnects
      prevRef.current[printer.id] = { gcodeState: currState, progress: curr.progress };
    }
  }, [printers, serverOnline]);
}
