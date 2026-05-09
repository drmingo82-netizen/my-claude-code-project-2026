import { useState } from 'react';
import Modal from './ui/Modal';
import { useFilamentStore } from '../stores/filamentStore';
import { acknowledgeJob } from '../hooks/usePrinterStatus';
import type { CompletedJob } from '../hooks/usePrinterStatus';

interface Props {
  printerId:   string;
  printerName: string;
  job:         CompletedJob;
  onDismiss:   () => void;
}

function formatFileName(raw: string | null): string {
  if (!raw) return 'Unknown file';
  return raw.split('/').pop() ?? raw;
}

function SlotLabel({ slot }: { slot: number }) {
  return <span className="font-mono text-[10px] bg-[#1e2a3a]/10 text-[#1e2a3a] px-1.5 py-0.5 rounded">AMS {slot + 1}</span>;
}

export default function JobCompleteModal({ printerId, printerName, job, onDismiss }: Props) {
  const spools      = useFilamentStore((s) => s.spools);
  const amsMappings = useFilamentStore((s) => s.amsMappings);
  const updateSpool = useFilamentStore((s) => s.updateSpool);

  const mappedSpoolId = job.amsSlot !== null
    ? (amsMappings.find((m) => m.printerId === printerId && m.amsSlot === job.amsSlot)?.spoolId ?? '')
    : '';

  const [selectedSpoolId, setSelectedSpoolId] = useState(mappedSpoolId);
  const [gramsUsed, setGramsUsed]             = useState<number>(job.filamentUsedG ?? 0);
  const [submitting, setSubmitting]           = useState(false);
  const [done, setDone]                       = useState(false);

  const selectedSpool = spools.find((s) => s.id === selectedSpoolId);
  const newRemaining  = selectedSpool
    ? Math.max(0, selectedSpool.weightRemainingG - gramsUsed)
    : null;

  async function handleDeduct() {
    if (!selectedSpool || gramsUsed <= 0) return;
    setSubmitting(true);
    updateSpool(selectedSpool.id, { weightRemainingG: newRemaining! });
    await acknowledgeJob(printerId);
    setDone(true);
    setSubmitting(false);
    setTimeout(onDismiss, 1200);
  }

  async function handleSkip() {
    await acknowledgeJob(printerId);
    onDismiss();
  }

  return (
    <Modal title="Print Job Complete" onClose={handleSkip}>
      {done ? (
        <div className="py-8 text-center">
          <div className="text-4xl mb-3">✓</div>
          <p className="text-sm font-semibold text-emerald-600">Filament updated</p>
          <p className="text-xs text-slate-400 mt-1">
            {selectedSpool
              ? `${selectedSpool.brand} ${selectedSpool.material} ${selectedSpool.color} → ${newRemaining}g remaining`
              : ''}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Job info */}
          <div className="bg-slate-50 rounded-lg p-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">
                  {formatFileName(job.file)}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {printerName} · Finished {new Date(job.completedAt).toLocaleTimeString([], {
                    hour: '2-digit', minute: '2-digit',
                  })}
                  {job.amsSlot !== null && (
                    <> · <SlotLabel slot={job.amsSlot} /></>
                  )}
                </p>
              </div>
              <span className="text-emerald-600 text-lg shrink-0">🖨️</span>
            </div>
          </div>

          {/* Spool selector */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Deduct from spool
              {job.amsSlot !== null && mappedSpoolId && (
                <span className="ml-1.5 text-[10px] text-[#f97316]">
                  (mapped from <SlotLabel slot={job.amsSlot} />)
                </span>
              )}
            </label>
            <select
              value={selectedSpoolId}
              onChange={(e) => setSelectedSpoolId(e.target.value)}
              className="w-full text-[16px] sm:text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316]"
            >
              <option value="">— Select spool —</option>
              {spools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.brand} {s.material} {s.color} ({s.weightRemainingG}g left)
                </option>
              ))}
            </select>
            {spools.length === 0 && (
              <p className="text-[10px] text-slate-400 mt-1">
                No spools in inventory. Add some in Filament Inventory first.
              </p>
            )}
          </div>

          {/* Grams used */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Filament used (g)
              {job.filamentUsedG !== null && (
                <span className="ml-1.5 text-[10px] text-slate-400">reported by printer</span>
              )}
            </label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={gramsUsed}
              onChange={(e) => setGramsUsed(Number(e.target.value))}
              className="w-full text-[16px] sm:text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316]"
            />
            {job.filamentUsedG === null && (
              <p className="text-[10px] text-slate-400 mt-1">
                Printer didn't report grams — enter manually or check your slicer estimate.
              </p>
            )}
          </div>

          {/* Preview */}
          {selectedSpool && gramsUsed > 0 && (
            <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between text-slate-500">
                <span>Current remaining</span>
                <span>{selectedSpool.weightRemainingG}g</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Deducting</span>
                <span className="text-red-500">− {gramsUsed}g</span>
              </div>
              <div className="flex justify-between font-semibold text-slate-700 border-t border-slate-200 pt-1">
                <span>New remaining</span>
                <span className={newRemaining! < selectedSpool.weightTotalG * 0.2
                  ? 'text-red-500' : 'text-emerald-600'}>
                  {newRemaining}g
                  {newRemaining! < selectedSpool.weightTotalG * 0.2 && ' ⚠️ low'}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleSkip}
              className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleDeduct}
              disabled={!selectedSpool || gramsUsed <= 0 || submitting}
              className="flex-1 py-2.5 rounded-lg bg-[#f97316] text-white text-sm font-medium hover:bg-[#ea6d0f] transition-colors disabled:opacity-40"
            >
              {submitting ? 'Saving…' : 'Deduct & Close'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
