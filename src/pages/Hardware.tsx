import { useState, useMemo } from 'react';
import { useHardwareStore } from '../stores/hardwareStore';
import { useDryingStore } from '../stores/dryingStore';
import { useFilamentStore } from '../stores/filamentStore';
import type {
  Printer3D, AMSSystem, BuildPlate, FilamentDryer,
  PrinterStatus, AmsType, PlateType,
} from '../types';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import FormField from '../components/ui/FormField';
import { generateColorFromName, isDark } from '../utils/colorUtils';

// ── Shared constants ──────────────────────────────────────────────────────────

const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'Resin', 'Other'];

const AMS_TYPES: AmsType[] = ['AMS', 'AMS Lite', 'AMS 2 Pro', 'AMS Hub'];

const PLATE_TYPES: PlateType[] = [
  'Cool Plate', 'Engineering Plate', 'High Temp Plate',
  'Textured PEI', 'Smooth PEI', 'Other',
];

const STATUS_LABELS: Record<PrinterStatus, string> = {
  active: 'Active', maintenance: 'Maintenance', retired: 'Retired',
};

const STATUS_COLORS: Record<PrinterStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  maintenance: 'bg-amber-50 text-amber-700',
  retired: 'bg-slate-100 text-slate-500',
};

// Bridge printer fallbacks so existing AMS mappings still link
const BRIDGE_PRINTERS = [
  { value: 'p1s', label: 'Bambu Lab P1S (bridge)' },
  { value: 'h2s', label: 'Bambu Lab H2S (bridge)' },
];

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PrinterStatus }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function MaterialMultiSelect({
  value, onChange,
}: { value: string[]; onChange: (v: string[]) => void }) {
  function toggle(m: string) {
    onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m]);
  }
  return (
    <div className="grid grid-cols-4 gap-x-2 gap-y-1.5">
      {MATERIALS.map((m) => (
        <label key={m} className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={value.includes(m)}
            onChange={() => toggle(m)}
            className="w-3.5 h-3.5 rounded accent-[#f97316]"
          />
          <span className="text-xs text-slate-600">{m}</span>
        </label>
      ))}
    </div>
  );
}

function SectionEmpty({
  icon, label, sub, onAdd,
}: { icon: string; label: string; sub: string; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-slate-100">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="text-sm font-medium text-slate-600 mb-1">{label}</p>
      <p className="text-xs text-slate-400 mb-4">{sub}</p>
      <button
        onClick={onAdd}
        className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
      >
        + Add
      </button>
    </div>
  );
}

function formBtns(onClose: () => void, label = 'Save') {
  return (
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
        {label}
      </button>
    </div>
  );
}

// ── AMS slot grid ─────────────────────────────────────────────────────────────

function AmsSlotGrid({ linkedPrinterId, slotCount }: { linkedPrinterId?: string; slotCount: number }) {
  const spools = useFilamentStore((s) => s.spools);
  const amsMappings = useFilamentStore((s) => s.amsMappings);

  const slots = useMemo(
    () =>
      Array.from({ length: slotCount }, (_, i) => {
        const mapping = linkedPrinterId
          ? amsMappings.find((m) => m.printerId === linkedPrinterId && m.amsSlot === i)
          : null;
        const spool = mapping ? spools.find((s) => s.id === mapping.spoolId) : null;
        return { i, spool };
      }),
    [slotCount, linkedPrinterId, amsMappings, spools],
  );

  return (
    <div className="flex gap-2 flex-wrap mt-2">
      {slots.map(({ i, spool }) => {
        const hex = spool ? (spool.colorHex || generateColorFromName(spool.color)) : null;
        const dark = hex ? isDark(hex) : false;
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div
              className="w-9 h-9 rounded-full border-2 border-white shadow-sm flex items-center justify-center"
              style={{ backgroundColor: hex ?? '#e2e8f0' }}
              title={spool ? `${spool.brand} ${spool.material} ${spool.color}` : 'Empty'}
            >
              {!spool && <span className="text-slate-400 text-[10px] font-bold">{i + 1}</span>}
              {spool && dark && (
                <span className="text-white text-[8px] font-bold">{i + 1}</span>
              )}
            </div>
            <p className="text-[8px] text-slate-400 max-w-[40px] truncate text-center">
              {spool ? spool.color : 'Empty'}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── TAB 1: 3D Printers ────────────────────────────────────────────────────────

type PrinterFormData = Omit<Printer3D, 'id'>;

const emptyPrinter = (): PrinterFormData => ({
  name: '', brand: '', model: '',
  buildVolumeX: undefined, buildVolumeY: undefined, buildVolumeZ: undefined,
  maxNozzleTempC: undefined, maxBedTempC: undefined,
  filamentDiameter: '1.75',
  compatibleMaterials: ['PLA', 'PETG'],
  purchaseDate: undefined, purchasePrice: undefined,
  notes: '', status: 'active',
});

function validatePrinter(f: PrinterFormData) {
  const e: Record<string, string> = {};
  if (!f.name.trim()) e.name = 'Required';
  if (!f.brand.trim()) e.brand = 'Required';
  if (!f.model.trim()) e.model = 'Required';
  return e;
}

function PrinterForm({ initial, onSave, onClose }: {
  initial: PrinterFormData; onSave: (d: PrinterFormData) => void; onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof PrinterFormData>(k: K, v: PrinterFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validatePrinter(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField label="Printer Name" value={form.name} error={errors.name}
        onChange={(e) => set('name', (e.target as HTMLInputElement).value)}
        placeholder="e.g. My P1S" />
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Brand" value={form.brand} error={errors.brand}
          onChange={(e) => set('brand', (e.target as HTMLInputElement).value)}
          placeholder="e.g. Bambu Lab" />
        <FormField label="Model" value={form.model} error={errors.model}
          onChange={(e) => set('model', (e.target as HTMLInputElement).value)}
          placeholder="e.g. P1S" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField as="select" label="Status" value={form.status}
          onChange={(e) => set('status', (e.target as HTMLSelectElement).value as PrinterStatus)}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'maintenance', label: 'Maintenance' },
            { value: 'retired', label: 'Retired' },
          ]} />
        <FormField as="select" label="Filament Diameter" value={form.filamentDiameter}
          onChange={(e) => set('filamentDiameter', (e.target as HTMLSelectElement).value as '1.75' | '2.85')}
          options={[{ value: '1.75', label: '1.75 mm' }, { value: '2.85', label: '2.85 mm' }]} />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-600 mb-1.5">Build Volume (mm, optional)</p>
        <div className="grid grid-cols-3 gap-2">
          {(['buildVolumeX', 'buildVolumeY', 'buildVolumeZ'] as const).map((k, i) => (
            <div key={k}>
              <input type="number" min={0} step={1}
                value={form[k] ?? ''}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  set(k, v === '' ? undefined : Number(v));
                }}
                placeholder={['X', 'Y', 'Z'][i]}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(['maxNozzleTempC', 'maxBedTempC'] as const).map((k) => (
          <div key={k}>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {k === 'maxNozzleTempC' ? 'Max Nozzle Temp (°C)' : 'Max Bed Temp (°C)'}
            </label>
            <input type="number" min={0} step={5}
              value={form[k] ?? ''}
              onChange={(e) => {
                const v = (e.target as HTMLInputElement).value;
                set(k, v === '' ? undefined : Number(v));
              }}
              placeholder="Optional"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
          </div>
        ))}
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Compatible Materials</label>
        <MaterialMultiSelect value={form.compatibleMaterials} onChange={(v) => set('compatibleMaterials', v)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Purchase Date" type="date"
          value={form.purchaseDate ?? ''}
          onChange={(e) => set('purchaseDate', (e.target as HTMLInputElement).value || undefined)} />
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Purchase Price ($)</label>
          <input type="number" min={0} step={0.01}
            value={form.purchasePrice ?? ''}
            onChange={(e) => {
              const v = (e.target as HTMLInputElement).value;
              set('purchasePrice', v === '' ? undefined : Number(v));
            }}
            placeholder="Optional"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
        </div>
      </div>
      <FormField as="textarea" label="Notes (optional)" value={form.notes ?? ''}
        onChange={(e) => set('notes', (e.target as HTMLTextAreaElement).value)}
        placeholder="Upgrades, mods, location…" />
      {formBtns(onClose, 'Save Printer')}
    </form>
  );
}

function PrintersTab() {
  const { printers, addPrinter, updatePrinter, deletePrinter } = useHardwareStore();
  const amsMappings = useFilamentStore((s) => s.amsMappings);
  const [modal, setModal] = useState<'add' | { printer: Printer3D } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fmtC = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function loadedSpoolCount(printerId: string) {
    return new Set(amsMappings.filter((m) => m.printerId === printerId).map((m) => m.spoolId)).size;
  }

  function handleSave(data: PrinterFormData) {
    if (modal === 'add') addPrinter(data);
    else if (modal && typeof modal === 'object') updatePrinter(modal.printer.id, data);
    setModal(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setModal('add')}
          className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors">
          + Add Printer
        </button>
      </div>

      {printers.length === 0 ? (
        <SectionEmpty icon="🖨️" label="No printers registered"
          sub="Add your 3D printers to track specs and loaded filament."
          onAdd={() => setModal('add')} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Printer', 'Brand / Model', 'Status', 'Build Vol', 'Materials', 'Price', 'Spools', ''].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {printers.map((p) => {
                  const vol = [p.buildVolumeX, p.buildVolumeY, p.buildVolumeZ].filter(Boolean);
                  return (
                    <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{p.name}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {p.brand} <span className="text-slate-400">{p.model}</span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {vol.length === 3 ? `${vol.join('×')} mm` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {p.compatibleMaterials.slice(0, 3).map((m) => (
                            <span key={m} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{m}</span>
                          ))}
                          {p.compatibleMaterials.length > 3 && (
                            <span className="text-[9px] text-slate-400">+{p.compatibleMaterials.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {p.purchasePrice ? fmtC(p.purchasePrice) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {loadedSpoolCount(p.id) > 0
                          ? <span className="text-xs text-[#f97316] font-semibold">{loadedSpoolCount(p.id)} loaded</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setModal({ printer: p })} className="text-xs text-[#f97316] hover:underline">Edit</button>
                          <button onClick={() => setDeleteId(p.id)} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Delete</button>
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

      {modal !== null && (
        <Modal title={modal === 'add' ? 'Add Printer' : `Edit — ${(modal as { printer: Printer3D }).printer.name}`}
          onClose={() => setModal(null)}>
          <PrinterForm
            initial={modal === 'add' ? emptyPrinter() : { ...((modal as { printer: Printer3D }).printer) }}
            onSave={handleSave} onClose={() => setModal(null)} />
        </Modal>
      )}
      {deleteId && (
        <ConfirmDialog message="Delete this printer? AMS systems and build plates linked to it will be unlinked."
          onConfirm={() => { deletePrinter(deleteId); setDeleteId(null); }}
          onCancel={() => setDeleteId(null)} />
      )}
    </div>
  );
}

// ── TAB 2: AMS Systems ────────────────────────────────────────────────────────

type AmsFormData = Omit<AMSSystem, 'id'>;

const emptyAms = (): AmsFormData => ({
  name: '', type: 'AMS', slotCount: 4, linkedPrinterId: '', notes: '',
});

function AmsForm({ initial, printers, onSave, onClose }: {
  initial: AmsFormData; printers: Printer3D[];
  onSave: (d: AmsFormData) => void; onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof AmsFormData>(k: K, v: AmsFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setErrors({ name: 'Required' }); return; }
    onSave({ ...form, linkedPrinterId: form.linkedPrinterId || undefined });
  }

  const printerOptions = [
    ...printers.map((p) => ({ value: p.id, label: p.name })),
    ...BRIDGE_PRINTERS,
  ];

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField label="AMS Name" value={form.name} error={errors.name}
        onChange={(e) => set('name', (e.target as HTMLInputElement).value)}
        placeholder="e.g. AMS on P1S" />
      <div className="grid grid-cols-2 gap-3">
        <FormField as="select" label="AMS Type" value={form.type}
          onChange={(e) => set('type', (e.target as HTMLSelectElement).value as AmsType)}
          options={AMS_TYPES.map((t) => ({ value: t, label: t }))} />
        <FormField as="select" label="Slot Count" value={String(form.slotCount)}
          onChange={(e) => set('slotCount', Number((e.target as HTMLSelectElement).value) as 4 | 8)}
          options={[{ value: '4', label: '4 slots' }, { value: '8', label: '8 slots' }]} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Linked Printer (optional)</label>
        <select value={form.linkedPrinterId ?? ''}
          onChange={(e) => set('linkedPrinterId', e.target.value)}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316]">
          <option value="">— None —</option>
          {printerOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <FormField as="textarea" label="Notes (optional)" value={form.notes ?? ''}
        onChange={(e) => set('notes', (e.target as HTMLTextAreaElement).value)}
        placeholder="Serial number, firmware…" />
      {formBtns(onClose, 'Save AMS System')}
    </form>
  );
}

function AmsTab() {
  const { amsSystems, printers, addAms, updateAms, deleteAms } = useHardwareStore();
  const [modal, setModal] = useState<'add' | { ams: AMSSystem } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function handleSave(data: AmsFormData) {
    if (modal === 'add') addAms(data);
    else if (modal && typeof modal === 'object') updateAms(modal.ams.id, data);
    setModal(null);
  }

  function printerName(id?: string): string | null {
    if (!id) return null;
    const hw = printers.find((p) => p.id === id);
    if (hw) return hw.name;
    const bridge = BRIDGE_PRINTERS.find((b) => b.value === id);
    return bridge?.label ?? id;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setModal('add')}
          className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors">
          + Add AMS System
        </button>
      </div>

      {amsSystems.length === 0 ? (
        <SectionEmpty icon="🗂️" label="No AMS systems registered"
          sub="Add your AMS units to see slot assignments and color grids."
          onAdd={() => setModal('add')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {amsSystems.map((ams) => (
            <div key={ams.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-[#1e2a3a]">{ams.name}</p>
                    <span className="text-[10px] bg-[#1e2a3a]/8 text-[#1e2a3a] px-1.5 py-0.5 rounded-full font-medium">
                      {ams.type}
                    </span>
                    <span className="text-[10px] text-slate-400">{ams.slotCount} slots</span>
                  </div>
                  {ams.linkedPrinterId && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {printerName(ams.linkedPrinterId)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setModal({ ams })} className="text-xs text-[#f97316] hover:underline">Edit</button>
                  <button onClick={() => setDeleteId(ams.id)} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Delete</button>
                </div>
              </div>
              <AmsSlotGrid linkedPrinterId={ams.linkedPrinterId} slotCount={ams.slotCount} />
              {ams.notes && (
                <p className="text-[10px] text-slate-400 border-t border-slate-50 pt-2 mt-3 italic">{ams.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <Modal title={modal === 'add' ? 'Add AMS System' : `Edit — ${(modal as { ams: AMSSystem }).ams.name}`}
          onClose={() => setModal(null)}>
          <AmsForm
            initial={modal === 'add' ? emptyAms() : { ...(modal as { ams: AMSSystem }).ams }}
            printers={printers} onSave={handleSave} onClose={() => setModal(null)} />
        </Modal>
      )}
      {deleteId && (
        <ConfirmDialog message="Delete this AMS system? Slot assignment data in Filament Inventory is not affected."
          onConfirm={() => { deleteAms(deleteId); setDeleteId(null); }}
          onCancel={() => setDeleteId(null)} />
      )}
    </div>
  );
}

// ── TAB 3: Build Plates ───────────────────────────────────────────────────────

type PlateFormData = Omit<BuildPlate, 'id'>;

const emptyPlate = (): PlateFormData => ({
  name: '', type: 'Textured PEI', compatibleMaterials: ['PLA', 'PETG'],
  linkedPrinterId: '', conditionNotes: '',
});

function PlateForm({ initial, printers, onSave, onClose }: {
  initial: PlateFormData; printers: Printer3D[];
  onSave: (d: PlateFormData) => void; onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof PlateFormData>(k: K, v: PlateFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setErrors({ name: 'Required' }); return; }
    onSave({ ...form, linkedPrinterId: form.linkedPrinterId || undefined });
  }

  const printerOptions = [
    ...printers.map((p) => ({ value: p.id, label: p.name })),
    ...BRIDGE_PRINTERS,
  ];

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField label="Plate Name" value={form.name} error={errors.name}
        onChange={(e) => set('name', (e.target as HTMLInputElement).value)}
        placeholder="e.g. My Textured PEI #1" />
      <div className="grid grid-cols-2 gap-3">
        <FormField as="select" label="Plate Type" value={form.type}
          onChange={(e) => set('type', (e.target as HTMLSelectElement).value as PlateType)}
          options={PLATE_TYPES.map((t) => ({ value: t, label: t }))} />
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Linked Printer (optional)</label>
          <select value={form.linkedPrinterId ?? ''}
            onChange={(e) => set('linkedPrinterId', e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316]">
            <option value="">— None —</option>
            {printerOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Compatible Materials</label>
        <MaterialMultiSelect value={form.compatibleMaterials} onChange={(v) => set('compatibleMaterials', v)} />
      </div>
      <FormField as="textarea" label="Condition Notes (optional)"
        value={form.conditionNotes ?? ''}
        onChange={(e) => set('conditionNotes', (e.target as HTMLTextAreaElement).value)}
        placeholder="Scratches, wear, last cleaned…" />
      {formBtns(onClose, 'Save Build Plate')}
    </form>
  );
}

function PlatesTab() {
  const { buildPlates, printers, addPlate, updatePlate, deletePlate } = useHardwareStore();
  const [modal, setModal] = useState<'add' | { plate: BuildPlate } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function handleSave(data: PlateFormData) {
    if (modal === 'add') addPlate(data);
    else if (modal && typeof modal === 'object') updatePlate(modal.plate.id, data);
    setModal(null);
  }

  function printerName(id?: string): string | null {
    if (!id) return null;
    const hw = printers.find((p) => p.id === id);
    if (hw) return hw.name;
    return BRIDGE_PRINTERS.find((b) => b.value === id)?.label ?? id;
  }

  const TYPE_ICONS: Record<PlateType, string> = {
    'Cool Plate': '❄️', 'Engineering Plate': '⚙️', 'High Temp Plate': '🔥',
    'Textured PEI': '🪨', 'Smooth PEI': '✨', 'Other': '📋',
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setModal('add')}
          className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors">
          + Add Build Plate
        </button>
      </div>

      {buildPlates.length === 0 ? (
        <SectionEmpty icon="📋" label="No build plates registered"
          sub="Add your build plates to track condition and compatible materials."
          onAdd={() => setModal('add')} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Name', 'Type', 'Materials', 'Printer', 'Condition', ''].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buildPlates.map((plate) => (
                  <tr key={plate.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{plate.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs">
                        {TYPE_ICONS[plate.type]} {plate.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {plate.compatibleMaterials.slice(0, 3).map((m) => (
                          <span key={m} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{m}</span>
                        ))}
                        {plate.compatibleMaterials.length > 3 && (
                          <span className="text-[9px] text-slate-400">+{plate.compatibleMaterials.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {printerName(plate.linkedPrinterId) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[180px]">
                      <span className="truncate block">{plate.conditionNotes || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setModal({ plate })} className="text-xs text-[#f97316] hover:underline">Edit</button>
                        <button onClick={() => setDeleteId(plate.id)} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal !== null && (
        <Modal title={modal === 'add' ? 'Add Build Plate' : `Edit — ${(modal as { plate: BuildPlate }).plate.name}`}
          onClose={() => setModal(null)}>
          <PlateForm
            initial={modal === 'add' ? emptyPlate() : { ...(modal as { plate: BuildPlate }).plate }}
            printers={printers} onSave={handleSave} onClose={() => setModal(null)} />
        </Modal>
      )}
      {deleteId && (
        <ConfirmDialog message="Delete this build plate? This cannot be undone."
          onConfirm={() => { deletePlate(deleteId); setDeleteId(null); }}
          onCancel={() => setDeleteId(null)} />
      )}
    </div>
  );
}

// ── TAB 4: Filament Dryers ────────────────────────────────────────────────────

type DryerFormData = Omit<FilamentDryer, 'id'>;

const emptyDryer = (): DryerFormData => ({
  name: '', brand: '', model: '', maxTempC: 70, capacitySpools: undefined, notes: '',
});

function validateDryer(f: DryerFormData) {
  const e: Partial<Record<keyof DryerFormData, string>> = {};
  if (!f.name.trim()) e.name = 'Required';
  if (f.maxTempC < 1) e.maxTempC = 'Must be > 0';
  if (f.capacitySpools !== undefined && f.capacitySpools < 1) e.capacitySpools = 'Must be ≥ 1';
  return e;
}

function DryerForm({ initial, onSave, onClose }: {
  initial: DryerFormData; onSave: (d: DryerFormData) => void; onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof DryerFormData, string>>>({});
  const set = <K extends keyof DryerFormData>(k: K, v: DryerFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateDryer(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField label="Dryer Name" value={form.name} error={errors.name}
        onChange={(e) => set('name', (e.target as HTMLInputElement).value)}
        placeholder="e.g. Bambu Lab Drying Station" />
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Brand (optional)" value={form.brand ?? ''}
          onChange={(e) => set('brand', (e.target as HTMLInputElement).value || undefined)}
          placeholder="e.g. Bambu Lab" />
        <FormField label="Model (optional)" value={form.model ?? ''}
          onChange={(e) => set('model', (e.target as HTMLInputElement).value || undefined)}
          placeholder="e.g. H1S" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Max Temp (°C)" type="number" min={1} max={300} step={5}
          value={form.maxTempC}
          onChange={(e) => set('maxTempC', Number((e.target as HTMLInputElement).value))}
          error={errors.maxTempC} />
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Capacity (spools, optional)</label>
          <input type="number" min={1} step={1} value={form.capacitySpools ?? ''}
            onChange={(e) => {
              const v = (e.target as HTMLInputElement).value;
              set('capacitySpools', v === '' ? undefined : Math.max(1, Math.round(Number(v))));
            }}
            placeholder="Leave blank"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
          {errors.capacitySpools && <p className="text-xs text-red-500 mt-1">{errors.capacitySpools}</p>}
        </div>
      </div>
      <FormField as="textarea" label="Notes (optional)" value={form.notes ?? ''}
        onChange={(e) => set('notes', (e.target as HTMLTextAreaElement).value || undefined)}
        placeholder="Voltage, features, location…" />
      {formBtns(onClose, 'Save Dryer')}
    </form>
  );
}

function DryersTab() {
  const { dryers, activeTimers, addDryer, updateDryer, deleteDryer } = useDryingStore();
  const spools = useFilamentStore((s) => s.spools);
  const [modal, setModal] = useState<'add' | { dryer: FilamentDryer } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function handleSave(data: DryerFormData) {
    if (modal === 'add') addDryer(data);
    else if (modal && typeof modal === 'object') updateDryer(modal.dryer.id, data);
    setModal(null);
  }

  function getActiveSpools(dryerId: string) {
    return activeTimers.filter((t) => t.dryerId === dryerId).map((t) => {
      const end = new Date(t.startedAt).getTime() + t.durationMinutes * 60000;
      const spool = spools.find((s) => s.id === t.spoolId);
      return { label: spool ? `${spool.brand} ${spool.material} ${spool.color}` : t.spoolLabel, remMs: Math.max(0, end - Date.now()) };
    });
  }

  const unlinked = activeTimers.filter((t) => !t.dryerId);

  return (
    <div className="space-y-4">
      {unlinked.length > 0 && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
          <p className="text-xs font-semibold text-emerald-700 mb-1.5">Active sessions without a dryer assigned</p>
          <div className="flex flex-wrap gap-2">
            {unlinked.map((t) => {
              const remMin = Math.max(0, Math.ceil((new Date(t.startedAt).getTime() + t.durationMinutes * 60000 - Date.now()) / 60000));
              return (
                <span key={t.spoolId} className="inline-flex items-center gap-1.5 text-xs bg-white border border-emerald-100 px-2.5 py-1 rounded-full text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {t.spoolLabel}{remMin > 0 ? ` · ${remMin}m left` : ' · Done'}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => setModal('add')}
          className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors">
          + Add Dryer
        </button>
      </div>

      {dryers.length === 0 ? (
        <SectionEmpty icon="🌡️" label="No dryers added yet"
          sub="Add your filament drying equipment to track active sessions."
          onAdd={() => setModal('add')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dryers.map((dryer) => {
            const active = getActiveSpools(dryer.id);
            const pct = dryer.capacitySpools && active.length > 0
              ? Math.min(100, (active.length / dryer.capacitySpools) * 100) : null;
            return (
              <div key={dryer.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span>🌡️</span>
                      <p className="text-sm font-semibold text-[#1e2a3a]">{dryer.name}</p>
                    </div>
                    {(dryer.brand || dryer.model) && (
                      <p className="text-xs text-slate-400 mt-0.5">{[dryer.brand, dryer.model].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setModal({ dryer })} className="text-xs text-[#f97316] hover:underline">Edit</button>
                    <button onClick={() => setDeleteId(dryer.id)} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Delete</button>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500 mb-2">
                  <span><span className="font-semibold text-slate-700">Max</span> {dryer.maxTempC}°C</span>
                  {dryer.capacitySpools && <span><span className="font-semibold text-slate-700">Cap.</span> {dryer.capacitySpools} spools</span>}
                </div>
                {pct !== null && (
                  <div className="mb-2">
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Drying</span><span>{active.length}/{dryer.capacitySpools}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-400' : pct > 70 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
                {active.length > 0 ? (
                  <div className="mt-1.5 space-y-1">
                    {active.map((s) => (
                      <div key={s.label} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                          <span className="text-slate-600 truncate">{s.label}</span>
                        </div>
                        <span className="text-slate-400 shrink-0 ml-2">
                          {s.remMs > 0 ? `${Math.ceil(s.remMs / 60000)}m` : 'Done'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-300">No spools currently drying</p>
                )}
                {dryer.notes && <p className="text-[10px] text-slate-400 border-t border-slate-50 pt-2 mt-2 italic">{dryer.notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      {modal !== null && (
        <Modal title={modal === 'add' ? 'Add Dryer' : `Edit — ${(modal as { dryer: FilamentDryer }).dryer.name}`}
          onClose={() => setModal(null)}>
          <DryerForm
            initial={modal === 'add' ? emptyDryer() : { ...(modal as { dryer: FilamentDryer }).dryer }}
            onSave={handleSave} onClose={() => setModal(null)} />
        </Modal>
      )}
      {deleteId && (
        <ConfirmDialog
          message="Delete this dryer? Active timers linked to it will lose their dryer assignment."
          onConfirm={() => { deleteDryer(deleteId); setDeleteId(null); }}
          onCancel={() => setDeleteId(null)} />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type HardwareTab = 'printers' | 'ams' | 'plates' | 'dryers';

const TABS: { key: HardwareTab; label: string; icon: string }[] = [
  { key: 'printers', label: '3D Printers', icon: '🖨️' },
  { key: 'ams',      label: 'AMS Systems', icon: '🗂️' },
  { key: 'plates',   label: 'Build Plates', icon: '📋' },
  { key: 'dryers',   label: 'Filament Dryers', icon: '🌡️' },
];

export default function Hardware() {
  const [activeTab, setActiveTab] = useState<HardwareTab>('printers');
  const { printers, amsSystems, buildPlates } = useHardwareStore();
  const { dryers } = useDryingStore();

  const counts: Record<HardwareTab, number> = {
    printers: printers.length,
    ams: amsSystems.length,
    plates: buildPlates.length,
    dryers: dryers.length,
  };

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="hidden lg:block text-xl font-bold text-[#1e2a3a]">Hardware Registry</h1>
        <p className="text-xs text-slate-400 lg:mt-0.5">
          Manage your printers, AMS systems, build plates, and dryers
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 overflow-x-auto pb-0.5 -mx-1 px-1">
        {TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={[
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
              activeTab === key
                ? 'bg-[#1e2a3a] text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
            ].join(' ')}
          >
            <span>{icon}</span>
            {label}
            {counts[key] > 0 && (
              <span className={[
                'inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold',
                activeTab === key ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500',
              ].join(' ')}>
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'printers' && <PrintersTab />}
      {activeTab === 'ams'      && <AmsTab />}
      {activeTab === 'plates'   && <PlatesTab />}
      {activeTab === 'dryers'   && <DryersTab />}
    </div>
  );
}
