import { useState, useRef } from 'react';
import { useFilamentStore } from '../stores/filamentStore';
import type { FilamentSpool } from '../types';
import { usePrinterStatus } from '../hooks/usePrinterStatus';
import { filamentCostPerG } from '../lib/metrics';
import { exportToCsv, parseCsv } from '../lib/csv';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import FormField from '../components/ui/FormField';

const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'Resin', 'Other'];

const fmt2 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const fmt4 = (n: number) => `$${n.toFixed(4)}`;

type FormData = Omit<FilamentSpool, 'id'>;

const emptyForm = (): FormData => ({
  brand: '',
  material: 'PLA',
  color: '',
  weightTotalG: 1000,
  weightRemainingG: 1000,
  costPerSpool: 0,
  purchasedAt: new Date().toISOString().slice(0, 10),
  notes: '',
});

function validate(f: FormData): Partial<Record<keyof FormData, string>> {
  const e: Partial<Record<keyof FormData, string>> = {};
  if (!f.brand.trim()) e.brand = 'Required';
  if (!f.color.trim()) e.color = 'Required';
  if (f.weightTotalG <= 0) e.weightTotalG = 'Must be > 0';
  if (f.weightRemainingG < 0) e.weightRemainingG = 'Cannot be negative';
  if (f.weightRemainingG > f.weightTotalG) e.weightRemainingG = 'Cannot exceed total weight';
  if (f.costPerSpool < 0) e.costPerSpool = 'Cannot be negative';
  return e;
}

interface SpoolFormProps {
  initial: FormData;
  onSave: (data: FormData) => void;
  onClose: () => void;
}

function SpoolForm({ initial, onSave, onClose }: SpoolFormProps) {
  const [form, setForm] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Brand"
          value={form.brand}
          onChange={(e) => set('brand', (e.target as HTMLInputElement).value)}
          placeholder="e.g. Hatchbox"
          error={errors.brand}
        />
        <FormField
          as="select"
          label="Material"
          value={form.material}
          onChange={(e) => set('material', (e.target as HTMLSelectElement).value)}
          options={MATERIALS.map((m) => ({ value: m, label: m }))}
        />
      </div>
      <FormField
        label="Color"
        value={form.color}
        onChange={(e) => set('color', (e.target as HTMLInputElement).value)}
        placeholder="e.g. Matte Black"
        error={errors.color}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Total Weight (g)"
          type="number"
          min={1}
          value={form.weightTotalG}
          onChange={(e) => set('weightTotalG', Number((e.target as HTMLInputElement).value))}
          error={errors.weightTotalG}
        />
        <FormField
          label="Remaining (g)"
          type="number"
          min={0}
          value={form.weightRemainingG}
          onChange={(e) => set('weightRemainingG', Number((e.target as HTMLInputElement).value))}
          error={errors.weightRemainingG}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Cost / Spool ($)"
          type="number"
          min={0}
          step={0.01}
          value={form.costPerSpool}
          onChange={(e) => set('costPerSpool', Number((e.target as HTMLInputElement).value))}
          error={errors.costPerSpool}
        />
        <FormField
          label="Purchased"
          type="date"
          value={form.purchasedAt}
          onChange={(e) => set('purchasedAt', (e.target as HTMLInputElement).value)}
        />
      </div>
      <FormField
        as="textarea"
        label="Notes (optional)"
        value={form.notes ?? ''}
        onChange={(e) => set('notes', (e.target as HTMLTextAreaElement).value)}
        placeholder="Any notes about this spool…"
      />

      {/* Live cost preview */}
      {form.weightTotalG > 0 && form.costPerSpool > 0 && (
        <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 flex justify-between">
          <span>Cost per gram</span>
          <span className="font-semibold">{fmt4(form.costPerSpool / form.weightTotalG)}/g</span>
        </div>
      )}

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
          Save Spool
        </button>
      </div>
    </form>
  );
}

function RemainBar({ pct }: { pct: number }) {
  const color = pct < 20 ? 'bg-red-400' : pct < 40 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`${color} h-full rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

const AMS_SLOTS = [0, 1, 2, 3];

function PrinterAmsSlots({ printerId, printerName }: { printerId: string; printerName: string }) {
  const spools          = useFilamentStore((s) => s.spools);
  const amsMappings     = useFilamentStore((s) => s.amsMappings);
  const setAmsMapping   = useFilamentStore((s) => s.setAmsMapping);
  const clearAmsMapping = useFilamentStore((s) => s.clearAmsMapping);

  function getSpoolId(slot: number): string {
    return amsMappings.find((m) => m.printerId === printerId && m.amsSlot === slot)?.spoolId ?? '';
  }

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 mb-2">{printerName}</p>
      <div className="space-y-2">
        {AMS_SLOTS.map((slot) => {
          const spoolId = getSpoolId(slot);
          return (
            <div key={slot} className="flex items-center gap-3">
              <span className="font-mono text-xs bg-[#1e2a3a]/10 text-[#1e2a3a] px-2 py-1 rounded shrink-0 w-14 text-center">
                AMS {slot + 1}
              </span>
              <select
                value={spoolId}
                onChange={(e) =>
                  e.target.value
                    ? setAmsMapping(printerId, slot, e.target.value)
                    : clearAmsMapping(printerId, slot)
                }
                className="flex-1 text-[16px] sm:text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#f97316]"
              >
                <option value="">— Unassigned —</option>
                {spools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.brand} {s.material} {s.color} ({s.weightRemainingG}g)
                  </option>
                ))}
              </select>
              {spoolId && (
                <button
                  onClick={() => clearAmsMapping(printerId, slot)}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors shrink-0 py-1.5 px-1"
                >
                  Clear
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AmsMappingSection() {
  const { printers, serverOnline } = usePrinterStatus();
  const spools = useFilamentStore((s) => s.spools);

  const visiblePrinters = serverOnline && printers.length > 0
    ? printers
    : [{ id: 'p1s', name: 'Bambu Lab P1S' }, { id: 'h2s', name: 'Bambu Lab H2S' }];

  return (
    <div className="mt-6 bg-white rounded-xl border border-slate-100 shadow-sm p-4">
      <p className="text-sm font-semibold text-[#1e2a3a] mb-1">AMS Slot Mapping</p>
      <p className="text-xs text-slate-400 mb-4">
        Link each AMS tray to a spool so filament is auto-deducted after a print.
      </p>
      <div className="space-y-6">
        {visiblePrinters.map((p) => (
          <PrinterAmsSlots key={p.id} printerId={p.id} printerName={p.name} />
        ))}
      </div>
      {spools.length === 0 && (
        <p className="text-xs text-slate-400 mt-4">Add spools above before mapping AMS slots.</p>
      )}
    </div>
  );
}

export default function Filament() {
  const spools = useFilamentStore((s) => s.spools);
  const { addSpool, updateSpool, deleteSpool, importSpools } = useFilamentStore();

  const [modal, setModal] = useState<'add' | { spool: FilamentSpool } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [importError, setImportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSave(data: FormData) {
    if (modal === 'add') {
      addSpool(data);
    } else if (modal && typeof modal === 'object') {
      updateSpool(modal.spool.id, data);
    }
    setModal(null);
  }

  function handleExport() {
    exportToCsv(
      'filament-inventory.csv',
      spools.map((s) => ({
        id: s.id,
        brand: s.brand,
        material: s.material,
        color: s.color,
        weightTotalG: s.weightTotalG,
        weightRemainingG: s.weightRemainingG,
        costPerSpool: s.costPerSpool,
        purchasedAt: s.purchasedAt,
        notes: s.notes ?? '',
      }))
    );
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCsv(ev.target?.result as string);
        const parsed: FilamentSpool[] = rows.map((r) => ({
          id: r.id || crypto.randomUUID(),
          brand: r.brand ?? '',
          material: r.material ?? 'PLA',
          color: r.color ?? '',
          weightTotalG: Number(r.weightTotalG) || 1000,
          weightRemainingG: Number(r.weightRemainingG) || 1000,
          costPerSpool: Number(r.costPerSpool) || 0,
          purchasedAt: r.purchasedAt ?? new Date().toISOString().slice(0, 10),
          notes: r.notes ?? '',
        }));
        if (importMode === 'replace') {
          importSpools(parsed);
        } else {
          importSpools([...spools, ...parsed]);
        }
        setImportError('');
      } catch {
        setImportError('Could not parse CSV. Make sure it matches the export format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // Summary stats
  const totalValue = spools.reduce((sum, s) => sum + filamentCostPerG(s) * s.weightRemainingG, 0);
  const totalRemainingKg = spools.reduce((sum, s) => sum + s.weightRemainingG, 0) / 1000;
  const lowCount = spools.filter(
    (s) => s.weightTotalG > 0 && s.weightRemainingG / s.weightTotalG < 0.2
  ).length;

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="hidden lg:block text-xl font-bold text-[#1e2a3a]">Filament Inventory</h1>
          <p className="text-xs text-slate-400 lg:mt-0.5">{spools.length} spool{spools.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <button
          onClick={() => setModal('add')}
          className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
        >
          + Add Spool
        </button>
      </div>

      {/* Summary cards */}
      {spools.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">Inventory Value</p>
            <p className="text-lg font-bold text-[#1e2a3a]">{fmt2(totalValue)}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">Remaining</p>
            <p className="text-lg font-bold text-[#1e2a3a]">{totalRemainingKg.toFixed(2)} kg</p>
          </div>
          <div className={`rounded-xl p-3 border shadow-sm text-center ${lowCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
            <p className={`text-xs mb-0.5 ${lowCount > 0 ? 'text-red-500' : 'text-slate-400'}`}>Low Stock</p>
            <p className={`text-lg font-bold ${lowCount > 0 ? 'text-red-600' : 'text-[#1e2a3a]'}`}>{lowCount}</p>
          </div>
        </div>
      )}

      {/* Import/Export toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={handleExport}
          disabled={spools.length === 0}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
        >
          ↓ Export CSV
        </button>
        <div className="flex items-center gap-1.5">
          <select
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as 'replace' | 'merge')}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#f97316]"
          >
            <option value="replace">Replace all</option>
            <option value="merge">Merge</option>
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            ↑ Import CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
        </div>
        {importError && <p className="text-xs text-red-500">{importError}</p>}
      </div>

      {/* Table */}
      {spools.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-100">
          <div className="text-4xl mb-3">🧵</div>
          <p className="text-sm font-medium text-slate-600 mb-1">No spools yet</p>
          <p className="text-xs text-slate-400 mb-4">Add your first filament spool to start tracking costs.</p>
          <button
            onClick={() => setModal('add')}
            className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
          >
            + Add Spool
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Brand', 'Material', 'Color', 'Remaining', 'Weight', 'Cost', 'Cost/g', 'Purchased', ''].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spools.map((spool) => {
                  const pct =
                    spool.weightTotalG > 0
                      ? (spool.weightRemainingG / spool.weightTotalG) * 100
                      : 0;
                  const cpg = filamentCostPerG(spool);
                  return (
                    <tr
                      key={spool.id}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{spool.brand}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block bg-[#1e2a3a]/10 text-[#1e2a3a] text-xs font-medium px-2 py-0.5 rounded-full">
                          {spool.material}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{spool.color}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <RemainBar pct={pct} />
                          <p className="text-[10px] text-slate-400">{spool.weightRemainingG}g / {spool.weightTotalG}g</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{spool.weightTotalG}g</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt2(spool.costPerSpool)}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt4(cpg)}</td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{spool.purchasedAt}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setModal({ spool })}
                            className="text-xs text-[#f97316] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteId(spool.id)}
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

      {/* AMS slot mapping */}
      <AmsMappingSection />

      {/* Add/Edit modal */}
      {modal !== null && (
        <Modal
          title={modal === 'add' ? 'Add Filament Spool' : 'Edit Spool'}
          onClose={() => setModal(null)}
        >
          <SpoolForm
            initial={
              modal === 'add'
                ? emptyForm()
                : {
                    brand: (modal as { spool: FilamentSpool }).spool.brand,
                    material: (modal as { spool: FilamentSpool }).spool.material,
                    color: (modal as { spool: FilamentSpool }).spool.color,
                    weightTotalG: (modal as { spool: FilamentSpool }).spool.weightTotalG,
                    weightRemainingG: (modal as { spool: FilamentSpool }).spool.weightRemainingG,
                    costPerSpool: (modal as { spool: FilamentSpool }).spool.costPerSpool,
                    purchasedAt: (modal as { spool: FilamentSpool }).spool.purchasedAt,
                    notes: (modal as { spool: FilamentSpool }).spool.notes ?? '',
                  }
            }
            onSave={handleSave}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <ConfirmDialog
          message="Delete this spool? This cannot be undone."
          onConfirm={() => { deleteSpool(deleteId); setDeleteId(null); }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
