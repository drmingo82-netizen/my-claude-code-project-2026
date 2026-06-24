import { useState, useEffect } from 'react';
import { useQueueStore } from '../stores/queueStore';
import { useSKUStore } from '../stores/skuStore';
import { usePrinterStatus } from '../hooks/usePrinterStatus';
import { useAutoPrintStore } from '../stores/autoPrintStore';
import type { PrintQueueItem, QueueStatus, QueueTargetPrinter } from '../types';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import FormField from '../components/ui/FormField';

const STATUSES: QueueStatus[] = ['queued', 'printing', 'done', 'cancelled'];
const PRINTERS: { value: QueueTargetPrinter; label: string }[] = [
  { value: 'any',    label: 'Any' },
  { value: 'p1s',    label: 'Martha (P1S)' },
  { value: 'h2s',    label: 'Athena (H2D)' },
  { value: 'a2l',    label: 'SCARLETT (A2L)' },
  { value: 'a1',     label: 'Delores (A1)' },
  { value: 'a1mini', label: 'Rosie (A1 Mini)' },
];

function statusBadge(status: QueueStatus) {
  switch (status) {
    case 'queued':    return 'bg-sky-100 text-sky-700';
    case 'printing':  return 'bg-amber-100 text-amber-700';
    case 'done':      return 'bg-emerald-100 text-emerald-700';
    case 'cancelled': return 'bg-slate-100 text-slate-500';
    case 'failed':    return 'bg-red-100 text-red-600';
  }
}

function statusLabel(status: QueueStatus) {
  switch (status) {
    case 'queued':    return 'Queued';
    case 'printing':  return 'Printing';
    case 'done':      return 'Done';
    case 'cancelled': return 'Cancelled';
    case 'failed':    return 'Failed';
  }
}

function printerLabel(p: QueueTargetPrinter) {
  switch (p) {
    case 'p1s':    return 'Martha';
    case 'h2s':    return 'Athena';
    case 'a2l':    return 'SCARLETT';
    case 'a1':     return 'Delores';
    case 'a1mini': return 'Rosie';
    default:       return 'Any';
  }
}

// ── Form ──────────────────────────────────────────────────────────────────────

type FormData = Omit<PrintQueueItem, 'id' | 'createdAt' | 'activePrinterId' | 'startedAt'>;

function emptyForm(nextPriority: number): FormData {
  return {
    displayName: '',
    fileName: '',
    skuId: undefined,
    copies: 1,
    copiesCompleted: 0,
    targetPrinter: 'any',
    priority: nextPriority,
    status: 'queued',
    notes: '',
  };
}

function toFormData(item: PrintQueueItem): FormData {
  return {
    displayName:     item.displayName,
    fileName:        item.fileName,
    skuId:           item.skuId,
    copies:          item.copies,
    copiesCompleted: item.copiesCompleted,
    targetPrinter:   item.targetPrinter,
    priority:        item.priority,
    status:          item.status,
    notes:           item.notes ?? '',
  };
}

function validate(f: FormData): Partial<Record<keyof FormData, string>> {
  const e: Partial<Record<keyof FormData, string>> = {};
  if (!f.displayName.trim()) e.displayName = 'Required';
  if (f.copies < 1)           e.copies = 'Must be at least 1';
  if (f.copiesCompleted < 0)  e.copiesCompleted = 'Cannot be negative';
  if (f.copiesCompleted > f.copies) e.copiesCompleted = 'Cannot exceed copies';
  return e;
}

interface QueueFormProps {
  initial: FormData;
  onSave: (data: FormData) => void;
  onClose: () => void;
}

function QueueForm({ initial, onSave, onClose }: QueueFormProps) {
  const skus = useSKUStore(s => s.skus);
  const [form, setForm] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  function handleSkuPick(skuId: string) {
    if (!skuId) { setField('skuId', undefined); return; }
    const sku = skus.find(s => s.id === skuId);
    setForm(f => ({ ...f, skuId, displayName: sku ? sku.name : f.displayName }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {skus.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Prefill from SKU Catalog (optional)
          </label>
          <select
            value={form.skuId ?? ''}
            onChange={e => handleSkuPick(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
          >
            <option value="">— pick a SKU to prefill name —</option>
            {skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      <FormField
        label="Display Name"
        value={form.displayName}
        onChange={e => setField('displayName', (e.target as HTMLInputElement).value)}
        placeholder="e.g. Medium Bees — Blue/White"
        error={errors.displayName}
      />

      <FormField
        label="File Name (.3mf)"
        value={form.fileName}
        onChange={e => setField('fileName', (e.target as HTMLInputElement).value)}
        placeholder="e.g. medium_bees_v3.3mf — must exist in print-files/"
      />

      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Copies"
          type="number"
          min={1}
          value={form.copies}
          onChange={e => setField('copies', Number((e.target as HTMLInputElement).value))}
          error={errors.copies}
        />
        <FormField
          label="Completed"
          type="number"
          min={0}
          value={form.copiesCompleted}
          onChange={e => setField('copiesCompleted', Number((e.target as HTMLInputElement).value))}
          error={errors.copiesCompleted}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField
          as="select"
          label="Target Printer"
          value={form.targetPrinter}
          onChange={e => setField('targetPrinter', (e.target as HTMLSelectElement).value as QueueTargetPrinter)}
          options={PRINTERS}
        />
        <FormField
          as="select"
          label="Status"
          value={form.status}
          onChange={e => setField('status', (e.target as HTMLSelectElement).value as QueueStatus)}
          options={STATUSES.map(s => ({ value: s, label: statusLabel(s) }))}
        />
      </div>

      <FormField
        label="Priority (lower = sooner)"
        type="number"
        min={1}
        value={form.priority}
        onChange={e => setField('priority', Number((e.target as HTMLInputElement).value))}
      />

      <FormField
        as="textarea"
        label="Notes (optional)"
        value={form.notes ?? ''}
        onChange={e => setField('notes', (e.target as HTMLTextAreaElement).value)}
        placeholder="Color config, special instructions…"
      />

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 py-2.5 rounded-lg bg-[#f97316] text-white text-sm font-medium hover:bg-[#ea6d0f] transition-colors"
        >
          Save
        </button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PrintQueue() {
  const { items, serverReachable, isHydrated, addItem, updateItem, deleteItem, moveUp, moveDown, dispatch } =
    useQueueStore();
  const { printers } = usePrinterStatus();
  const { enabled: autoEnabled, printers: autoPrinters, setEnabled: setAutoEnabled, markReady } = useAutoPrintStore();

  useEffect(() => {
    console.log('[PrintQueue] mounted — items:', items.length, 'hydrated:', isHydrated, 'reachable:', serverReachable);
  }, []);

  const [modal, setModal]       = useState<'add' | { item: PrintQueueItem } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState<string | null>(null); // item id being dispatched
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const nextPriority = items.length > 0 ? Math.max(...items.map(i => i.priority)) + 1 : 1;

  function isPrinterIdle(target: QueueTargetPrinter): boolean {
    const candidates = target === 'any'
      ? ['p1s', 'h2s', 'a2l', 'a1', 'a1mini']
      : [target];
    return candidates.some(id => {
      const p = printers.find(p => p.id === id);
      return p?.connection === 'connected' &&
        (p.printer.gcodeState === 'IDLE' || p.printer.gcodeState === 'FINISH');
    });
  }

  async function handleDispatch(item: PrintQueueItem) {
    setDispatching(item.id);
    setDispatchError(null);
    const result = await dispatch(item.id);
    setDispatching(null);
    if (!result.ok) {
      setDispatchError(result.error ?? 'Dispatch failed');
    }
  }

  function handleSave(data: FormData) {
    if (modal === 'add') {
      addItem(data);
    } else if (modal && typeof modal === 'object') {
      updateItem(modal.item.id, data);
    }
    setModal(null);
  }

  function handleDeleteConfirm() {
    if (!deleteId) return;
    deleteItem(deleteId);
    setDeleteId(null);
  }

  const queued   = items.filter(i => i.status === 'queued').length;
  const printing = items.filter(i => i.status === 'printing').length;
  const done     = items.filter(i => i.status === 'done').length;

  if (isHydrated && !serverReachable) {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="hidden lg:block text-xl font-bold text-[#1e2a3a]">Print Queue</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-100">
          <div className="text-4xl mb-3">🔌</div>
          <p className="text-sm font-medium text-slate-600 mb-1">Server unreachable</p>
          <p className="text-xs text-slate-400">
            The bridge server is not responding. Start it and refresh to manage the queue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="hidden lg:block text-xl font-bold text-[#1e2a3a]">Print Queue</h1>
          <p className="text-xs text-slate-400 lg:mt-0.5">{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setModal('add')}
          className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
        >
          + Add to Queue
        </button>
      </div>

      {/* Dispatch error banner */}
      {dispatchError && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <span className="text-xs font-medium text-red-600 flex-1">{dispatchError}</span>
          <button onClick={() => setDispatchError(null)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
        </div>
      )}

      {/* AutoPrint */}
      <div className="mb-5 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[#1e2a3a]">AutoPrint</p>
            <p className="text-xs text-slate-400">
              {autoEnabled
                ? 'On — clear a bed and tap Ready to start the next queued job.'
                : 'Off — dispatch prints manually with “Print now”.'}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={autoEnabled}
            onClick={() => setAutoEnabled(!autoEnabled)}
            className={[
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0',
              autoEnabled ? 'bg-[#f97316]' : 'bg-slate-300',
            ].join(' ')}
          >
            <span className={[
              'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
              autoEnabled ? 'translate-x-5' : 'translate-x-0.5',
            ].join(' ')} />
          </button>
        </div>

        {autoEnabled && (
          <div className="border-t border-slate-100 px-4 py-3 flex flex-wrap gap-2">
            {printers.map(p => {
              const ready   = autoPrinters[p.id]?.ready ?? false;
              const state   = p.printer.gcodeState;
              const busy    = state === 'RUNNING' || state === 'PAUSE';
              const offline = p.connection !== 'connected';
              return (
                <div key={p.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700 leading-none">{p.name}</p>
                    <p className="text-[10px] text-slate-400 leading-none mt-0.5">
                      {offline ? 'offline' : busy ? 'printing' : ready ? 'ready ✓ waiting for job' : state.toLowerCase()}
                    </p>
                  </div>
                  <button
                    onClick={() => markReady(p.id)}
                    disabled={offline || busy || ready}
                    title={offline ? 'Printer offline' : busy ? 'Printer is busy' : ready ? 'Already marked ready' : 'Bed is clear — start the next job'}
                    className="text-xs font-medium px-2.5 py-1 rounded-md bg-[#f97316] text-white hover:bg-[#ea6d0f] disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
                  >
                    {ready ? 'Ready ✓' : 'Ready'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary cards */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">Queued</p>
            <p className="text-lg font-bold text-sky-600">{queued}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">Printing</p>
            <p className="text-lg font-bold text-amber-500">{printing}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">Done</p>
            <p className="text-lg font-bold text-emerald-600">{done}</p>
          </div>
        </div>
      )}

      {/* Table */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-100">
          <div className="text-4xl mb-3">🖨️</div>
          <p className="text-sm font-medium text-slate-600 mb-1">Queue is empty</p>
          <p className="text-xs text-slate-400 mb-4">Add your first print job to get started.</p>
          <button
            onClick={() => setModal('add')}
            className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
          >
            + Add to Queue
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['#', 'Name', 'Printer', 'Copies', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const canDispatch = item.status === 'queued' && isPrinterIdle(item.targetPrinter) && serverReachable;
                  const isDispatching = dispatching === item.id;

                  return (
                    <tr key={item.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono text-slate-400 whitespace-nowrap w-10">
                        {item.priority}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 max-w-[220px]">
                        <span className="truncate block">{item.displayName}</span>
                        {item.fileName && (
                          <span className="text-[10px] text-slate-400 truncate block font-mono">{item.fileName}</span>
                        )}
                        {item.notes && (
                          <span className="text-[10px] text-slate-400 truncate block">{item.notes}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-block bg-[#1e2a3a]/8 text-[#1e2a3a] text-xs px-2 py-0.5 rounded-full">
                          {printerLabel(item.targetPrinter)}
                        </span>
                        {item.activePrinterId && item.status === 'printing' && (
                          <span className="block text-[10px] text-amber-600 mt-0.5">
                            → {printerLabel(item.activePrinterId as QueueTargetPrinter)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                        <span className="font-semibold">{item.copiesCompleted}</span>
                        <span className="text-slate-400">/{item.copies}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge(item.status)}`}>
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          {item.status === 'queued' && (
                            <button
                              onClick={() => handleDispatch(item)}
                              disabled={!canDispatch || isDispatching}
                              title={!isPrinterIdle(item.targetPrinter) ? 'Target printer is busy' : !serverReachable ? 'Bridge offline' : 'Send to printer now'}
                              className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {isDispatching ? '…' : 'Print now'}
                            </button>
                          )}
                          <button
                            onClick={() => moveUp(item.id)}
                            disabled={idx === 0}
                            className="text-slate-400 hover:text-slate-700 disabled:opacity-30 px-1 py-0.5 text-xs transition-colors"
                            title="Move up"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveDown(item.id)}
                            disabled={idx === items.length - 1}
                            className="text-slate-400 hover:text-slate-700 disabled:opacity-30 px-1 py-0.5 text-xs transition-colors"
                            title="Move down"
                          >
                            ▼
                          </button>
                          <button
                            onClick={() => setModal({ item })}
                            className="text-xs text-[#f97316] hover:underline ml-1"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteId(item.id)}
                            className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {modal !== null && (
        <Modal
          title={modal === 'add' ? 'Add to Queue' : (modal as { item: PrintQueueItem }).item.displayName}
          onClose={() => setModal(null)}
        >
          <QueueForm
            initial={
              modal === 'add'
                ? emptyForm(nextPriority)
                : toFormData((modal as { item: PrintQueueItem }).item)
            }
            onSave={handleSave}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <ConfirmDialog
          message="Remove this item from the queue? This cannot be undone."
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
