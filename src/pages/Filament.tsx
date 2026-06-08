import { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFilamentStore } from '../stores/filamentStore';
import type { FilamentSpool } from '../types';
import { usePrinterStatus } from '../hooks/usePrinterStatus';
import { filamentCostPerG } from '../lib/metrics';
import { exportToCsv, parseCsv } from '../lib/csv';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import FormField from '../components/ui/FormField';
import SpoolLabelPanel from '../components/labels/SpoolLabelPanel';
import QRScannerModal from '../components/scanner/QRScannerModal';
import { exportAllData, importAllData, readBackupFile } from '../lib/dataBackup';
import DryingTab from '../components/filament/DryingTab';
import PrinterSetupPanel from '../components/filament/PrinterSetupPanel';
import SpoolHistoryTab from '../components/filament/SpoolHistoryTab';
import FilamentImportPanel, { type ImportableSpool } from '../components/modals/FilamentImportPanel';
import BambuInvoiceImportPanel from '../components/modals/BambuInvoiceImportPanel';
import { useLocationStore } from '../stores/locationStore';
import { useAmsStatus, flattenAmsTrays } from '../hooks/useAmsStatus';
import { hueDiff, isDark, generateColorFromName, hexToHsl } from '../utils/colorUtils';
import { spoolNfcUrl } from '../utils/scanUtils';

const MATERIAL_CATEGORIES: { group: string; items: string[] }[] = [
  { group: 'PLA', items: [
    'PLA Basic', 'PLA Matte', 'PLA Tough+', 'PLA Silk', 'PLA Silk+',
    'PLA Silk Multi-Color', 'PLA Translucent', 'PLA Galaxy', 'PLA Metal',
    'PLA Marble', 'PLA Wood', 'PLA Glow', 'PLA Sparkle', 'PLA Basic Gradient',
    'PLA-CF', 'PLA Aero', 'PLA+', 'PLA (Generic)',
  ]},
  { group: 'PETG', items: ['PETG Basic', 'PETG-CF', 'PETG HF', 'PETG (Generic)'] },
  { group: 'ABS / ASA', items: ['ABS', 'ASA', 'ABS-CF', 'ASA-CF'] },
  { group: 'TPU', items: ['TPU 95A', 'TPU (Generic)'] },
  { group: 'Engineering', items: ['PA (Nylon)', 'PA-CF', 'PA-GF', 'PC', 'PET-CF', 'PPS', 'PPS-CF', 'PAHT-CF'] },
  { group: 'Support & Specialty', items: ['PVA', 'HIPS', 'BVOH', 'Resin'] },
  { group: 'Other', items: ['Other'] },
];


const fmt2 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const fmt4 = (n: number) => `$${n.toFixed(4)}`;

type FormData = Omit<FilamentSpool, 'id'>;

const emptyForm = (): FormData => ({
  brand: '',
  material: 'PLA',
  color: '',
  colorHex: undefined,
  weightTotalG: 1000,
  weightRemainingG: 1000,
  costPerSpool: 0,
  purchasedAt: new Date().toISOString().slice(0, 10),
  notes: '',
  locationId: undefined,
  lowStockThresholdGrams: 100,
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

function SpoolLocationSelect({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  const locations = useLocationStore((s) => s.locations);
  if (locations.length === 0) return null;
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">Storage Location</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
      >
        <option value="">— None —</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({l.type})
          </option>
        ))}
      </select>
    </div>
  );
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
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Material</label>
          <select
            value={form.material}
            onChange={(e) => set('material', e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
          >
            {MATERIAL_CATEGORIES.map((cat) => (
              <optgroup key={cat.group} label={cat.group}>
                {cat.items.map((m) => <option key={m} value={m}>{m}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
      <FormField
        label="Color Name"
        value={form.color}
        onChange={(e) => set('color', (e.target as HTMLInputElement).value)}
        placeholder="e.g. Matte Black"
        error={errors.color}
      />
      {/* Hex color picker — feeds My Colors palette tools */}
      <div className="flex items-center gap-2 -mt-2">
        <input
          type="color"
          value={form.colorHex ?? '#808080'}
          onChange={(e) => set('colorHex', e.target.value)}
          className="h-7 w-7 rounded border border-slate-200 cursor-pointer p-0.5 shrink-0 bg-white"
          title="Pick hex color for palette tools"
        />
        <input
          type="text"
          value={form.colorHex ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '' || /^#[0-9a-fA-F]{0,6}$/.test(v))
              set('colorHex', v || undefined);
          }}
          placeholder="Color hex — optional, for palette tools"
          maxLength={7}
          className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
        />
        {form.colorHex && (
          <button
            type="button"
            onClick={() => set('colorHex', undefined)}
            className="text-xs text-slate-400 hover:text-red-500 transition-colors shrink-0"
          >
            ×
          </button>
        )}
      </div>
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
        label="Low-Stock Alert (g)"
        type="number"
        min={0}
        value={form.lowStockThresholdGrams ?? 100}
        onChange={(e) => set('lowStockThresholdGrams', Number((e.target as HTMLInputElement).value))}
      />
      <FormField
        as="textarea"
        label="Notes (optional)"
        value={form.notes ?? ''}
        onChange={(e) => set('notes', (e.target as HTMLTextAreaElement).value)}
        placeholder="Any notes about this spool…"
      />

      <SpoolLocationSelect
        value={form.locationId}
        onChange={(id) => set('locationId', id)}
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

// ── AMS Mapping Section — live MQTT data + manual assignment ─────────────────

function relTime(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

// Derive a readable color name from HSL values for AMS-imported spools
function hexToColorName(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  if (l < 12) return 'Black';
  if (l > 88) return 'White';
  if (s < 12) {
    if (l < 35) return 'Dark Gray';
    if (l > 65) return 'Light Gray';
    return 'Gray';
  }
  if (h < 15 || h >= 345) return l < 40 ? 'Dark Red' : 'Red';
  if (h < 40) return 'Orange';
  if (h < 65) return 'Yellow';
  if (h < 80) return 'Yellow Green';
  if (h < 150) return l < 40 ? 'Dark Green' : 'Green';
  if (h < 175) return 'Teal';
  if (h < 210) return 'Cyan';
  if (h < 255) return l < 40 ? 'Dark Blue' : 'Blue';
  if (h < 285) return 'Purple';
  if (h < 315) return 'Magenta';
  return 'Pink';
}

function AmsSlotRow({
  slot,
  printerId,
  tray,
}: {
  slot: number;
  printerId: string;
  tray: import('../hooks/useAmsStatus').AmsTray | null;
}) {
  const spools = useFilamentStore((s) => s.spools);
  const amsMappings = useFilamentStore((s) => s.amsMappings);
  const addSpool = useFilamentStore((s) => s.addSpool);
  const setAmsMapping = useFilamentStore((s) => s.setAmsMapping);
  const clearAmsMapping = useFilamentStore((s) => s.clearAmsMapping);
  const [imported, setImported] = useState(false);

  const linkedSpoolId = amsMappings.find(
    (m) => m.printerId === printerId && m.amsSlot === slot,
  )?.spoolId ?? '';
  const linkedSpool = spools.find((s) => s.id === linkedSpoolId);

  // Auto-match: find the spool with the CLOSEST hue to the live tray color (within 30°).
  // Using find() (first match) caused all slots to suggest the same spool; reduce() to
  // minimum distance ensures each slot independently picks its best candidate.
  const suggestion = !linkedSpoolId && tray?.colorHex
    ? (() => {
        let best: typeof spools[0] | null = null;
        let bestDist = Infinity;
        for (const s of spools) {
          const spoolHex = s.colorHex || generateColorFromName(s.color);
          const dist = hueDiff(spoolHex, tray.colorHex!);
          if (dist < 30 && dist < bestDist) { best = s; bestDist = dist; }
        }
        return best;
      })()
    : null;

  const hex = tray?.colorHex ?? null;
  const dark = hex ? isDark(hex) : false;
  const hasData = tray !== null;

  function importFromAms() {
    if (!tray || (!tray.colorHex && !tray.filamentType)) return;

    // Derive color name: use trayIdName if it looks descriptive (not a raw ID code),
    // otherwise fall back to a name derived from the hex value
    let colorName: string;
    const name = tray.trayIdName ?? '';
    const looksDescriptive = /[A-Za-z]/.test(name) && !/^GF[A-Z0-9]+$/.test(name) && name.length > 3;
    if (looksDescriptive) {
      colorName = name;
    } else if (tray.colorHex) {
      colorName = hexToColorName(tray.colorHex);
    } else {
      colorName = 'Unknown';
    }

    const prevIds = new Set(useFilamentStore.getState().spools.map((s) => s.id));

    addSpool({
      brand: 'Bambu Lab',
      material: tray.filamentType ?? 'PLA',
      color: colorName,
      colorHex: tray.colorHex ?? undefined,
      weightTotalG: 1000,
      weightRemainingG: tray.remainPct !== null && tray.remainPct >= 0
        ? Math.round(1000 * tray.remainPct / 100)
        : 1000,
      costPerSpool: 0,
      purchasedAt: new Date().toISOString().slice(0, 10),
    });

    const newSpools = useFilamentStore.getState().spools.filter((s) => !prevIds.has(s.id));
    if (newSpools.length > 0) {
      setAmsMapping(printerId, slot, newSpools[0].id);
    }
    setImported(true);
    setTimeout(() => setImported(false), 3000);
  }

  return (
    <div className="flex items-start gap-3 p-3 bg-slate-50/70 rounded-xl border border-slate-100">
      {/* Color swatch */}
      <div
        className="w-10 h-10 rounded-full border-2 border-white shadow-sm flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: hex ?? '#e2e8f0' }}
        title={hex ?? 'No data'}
      >
        <span className={`text-[11px] font-bold leading-none ${hex ? (dark ? 'text-white/60' : 'text-black/40') : 'text-slate-400'}`}>
          {slot + 1}
        </span>
      </div>

      {/* Info + assignment */}
      <div className="flex-1 min-w-0">
        {/* Slot label + badges */}
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          <span className="text-xs font-semibold text-slate-700">AMS {slot + 1}</span>
          {tray?.filamentType && (
            <span className="text-[10px] bg-[#1e2a3a]/8 text-[#1e2a3a] px-1.5 py-0.5 rounded-full font-medium">
              {tray.filamentType}
            </span>
          )}
          {hex && (
            <span className="text-[10px] font-mono text-slate-400">{hex}</span>
          )}
          {!hasData && (
            <span className="text-[10px] text-slate-300 italic">No MQTT data</span>
          )}
        </div>

        {/* Remaining bar — remainPct is null for unknown slots, never negative */}
        {tray?.remainPct !== null && tray?.remainPct !== undefined && (
          <div className="mb-2">
            {(() => {
              const pct = Math.max(0, Math.min(100, tray.remainPct!));
              return (
                <>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                    <span>Remaining</span>
                    <span className={pct < 20 ? 'text-red-500 font-semibold' : ''}>{pct}%</span>
                  </div>
                  <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct < 20 ? 'bg-red-400' : pct < 50 ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Assignment state */}
        {linkedSpool ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-emerald-700 font-medium">
              ✓ {linkedSpool.brand} {linkedSpool.material} {linkedSpool.color}
            </span>
            <button
              onClick={() => clearAmsMapping(printerId, slot)}
              className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
            >
              Unlink
            </button>
          </div>
        ) : suggestion ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-amber-700">
                💡 {suggestion.brand} {suggestion.material} {suggestion.color}
              </span>
              <button
                onClick={() => setAmsMapping(printerId, slot, suggestion.id)}
                className="text-[10px] font-semibold text-[#f97316] hover:underline"
              >
                Link?
              </button>
            </div>
            {imported ? (
              <span className="text-[10px] text-emerald-600 font-medium">✓ Added to inventory</span>
            ) : hasData && (
              <button
                onClick={importFromAms}
                className="text-[10px] text-violet-600 hover:underline font-medium"
              >
                ↓ Import as new spool
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <select
              value=""
              onChange={(e) => e.target.value && setAmsMapping(printerId, slot, e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-500 bg-white focus:outline-none focus:ring-1 focus:ring-[#f97316]"
            >
              <option value="">
                {hasData ? '❓ Unknown — assign from inventory' : '— Unassigned —'}
              </option>
              {spools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.brand} {s.material} {s.color} ({s.weightRemainingG}g)
                </option>
              ))}
            </select>
            {imported ? (
              <span className="text-[10px] text-emerald-600 font-medium">✓ Added to inventory</span>
            ) : hasData && (
              <button
                onClick={importFromAms}
                className="text-[10px] text-violet-600 hover:underline font-medium"
              >
                ↓ Import as new spool
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PrinterAmsSlots({ printerId, printerName }: { printerId: string; printerName: string }) {
  const { printers } = useAmsStatus();
  const amsTrays = flattenAmsTrays(printers[printerId]);

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 mb-2">{printerName}</p>
      <div className="space-y-2">
        {[0, 1, 2, 3].map((slot) => (
          <AmsSlotRow
            key={slot}
            slot={slot}
            printerId={printerId}
            tray={amsTrays[slot] ?? null}
          />
        ))}
      </div>
    </div>
  );
}

function AmsMappingSection() {
  const { printers: statusPrinters, serverOnline } = usePrinterStatus();
  const { lastRefresh, serverOnline: amsOnline, refresh } = useAmsStatus();
  const spools = useFilamentStore((s) => s.spools);

  const visiblePrinters =
    serverOnline && statusPrinters.length > 0
      ? statusPrinters
      : [
          { id: 'p1s', name: 'Bambu Lab P1S' },
          { id: 'h2s', name: 'Bambu Lab H2S' },
        ];

  return (
    <div className="mt-6 bg-white rounded-xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-[#1e2a3a]">AMS Slot Mapping</p>
        <div className="flex items-center gap-2 shrink-0">
          {amsOnline && lastRefresh && (
            <span className="text-[10px] text-slate-400">
              Updated {relTime(lastRefresh)}
            </span>
          )}
          <button
            onClick={refresh}
            className="text-[10px] text-[#f97316] hover:underline font-medium"
            title="Refresh AMS data now"
          >
            ↺ Refresh
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Link each AMS tray to a spool. Live color and remaining % are pulled from the printer.
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

// ── Spool edit modal with Details / Labels tabs ───────────────────────────────

type SpoolTab = 'details' | 'labels' | 'drying' | 'history';

function SpoolEditModal({
  spool,
  onSave,
  onClose,
}: {
  spool: FilamentSpool;
  onSave: (d: FormData) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SpoolTab>('details');

  return (
    <div>
      <div className="flex gap-5 border-b border-slate-100 mb-4 -mt-1">
        {(['details', 'labels', 'drying', 'history'] as SpoolTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'text-sm font-medium pb-2.5 capitalize border-b-2 transition-colors',
              tab === t
                ? 'border-[#f97316] text-[#f97316]'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'details' && (
        <SpoolForm
          initial={{
            brand: spool.brand,
            material: spool.material,
            color: spool.color,
            colorHex: spool.colorHex,
            weightTotalG: spool.weightTotalG,
            weightRemainingG: spool.weightRemainingG,
            costPerSpool: spool.costPerSpool,
            purchasedAt: spool.purchasedAt,
            notes: spool.notes ?? '',
            locationId: spool.locationId,
            lowStockThresholdGrams: spool.lowStockThresholdGrams ?? 100,
          }}
          onSave={onSave}
          onClose={onClose}
        />
      )}
      {tab === 'labels' && <SpoolLabelPanel spool={spool} />}
      {tab === 'drying' && <DryingTab spool={spool} />}
      {tab === 'history' && <SpoolHistoryTab spool={spool} />}
    </div>
  );
}

// ── Write NFC Modal ───────────────────────────────────────────────────────────

function WriteNFCModal({
  spool,
  onClose,
  onMarked,
}: {
  spool: FilamentSpool;
  onClose: () => void;
  onMarked: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [nfcReady, setNfcReady] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const url = spoolNfcUrl(spool.id);

  async function writeToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  }

  async function copyUrl() {
    await writeToClipboard(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function openNfcTools() {
    await writeToClipboard(url);
    setNfcReady(true);
    // NFC Tools for iOS has no URL scheme — copy to clipboard then open App Store
    window.open('https://apps.apple.com/app/nfc-tools/id1252962749', '_blank');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-2xl p-5 pb-safe-or-6 space-y-4 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-[#1e2a3a]">Program NFC Tag</p>
            <p className="text-xs text-slate-400 mt-0.5">{spool.brand} {spool.material} — {spool.color}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 text-xl p-1">×</button>
        </div>

        {/* URL display + copy */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Tag URL</p>
          <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
            <code className="flex-1 text-[11px] text-slate-600 font-mono break-all leading-relaxed">{url}</code>
            <button
              onClick={copyUrl}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Copy + Open NFC Tools */}
        <div className="space-y-2">
          <button
            onClick={openNfcTools}
            className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-violet-600 text-white font-semibold text-sm active:scale-[0.98]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/>
              <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
              <circle cx="12" cy="12" r="2"/>
              <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/>
              <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>
            </svg>
            Copy URL &amp; Open NFC Tools
          </button>

          {nfcReady && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-800 leading-relaxed">
              <p className="font-semibold mb-1">URL copied to clipboard</p>
              <p>In NFC Tools: <strong>Write</strong> → <strong>Add a record</strong> → <strong>URL / URI</strong> → paste → <strong>OK</strong> → tap Write and hold near tag</p>
            </div>
          )}
        </div>

        {/* Manual instructions (collapsible) */}
        <div>
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            <span>{showInstructions ? '▾' : '▸'}</span>
            Manual instructions
          </button>
          {showInstructions && (
            <div className="mt-2 bg-slate-50 rounded-xl p-3 space-y-1.5 text-xs text-slate-600 leading-relaxed">
              <p>1. Tap <strong>Copy URL &amp; Open NFC Tools</strong> above</p>
              <p>2. In NFC Tools tap <strong>Write</strong> → <strong>Add a record</strong> → <strong>URL / URI</strong></p>
              <p>3. Paste the URL and tap <strong>OK</strong></p>
              <p>4. Tap <strong>Write / X bytes</strong> and hold your phone near the tag</p>
              <p>5. When successful, come back here and tap <strong>Mark as Programmed</strong></p>
            </div>
          )}
        </div>

        {/* Mark as programmed */}
        <button
          onClick={onMarked}
          className={`w-full py-4 rounded-2xl font-semibold text-sm active:scale-[0.98] transition-colors ${
            spool.nfcProgrammed
              ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200'
              : 'bg-emerald-600 text-white'
          }`}
        >
          {spool.nfcProgrammed ? '✓ Already Marked as Programmed' : 'Mark as Programmed'}
        </button>
      </div>
    </div>
  );
}

export default function Filament() {
  const spools = useFilamentStore((s) => s.spools);
  const { addSpool, updateSpool, deleteSpool, importSpools, markNfcProgrammed } = useFilamentStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const [showScanner, setShowScanner] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<import('../lib/dataBackup').BackupFile | null>(null);
  const [backupError, setBackupError] = useState('');
  const backupFileRef = useRef<HTMLInputElement>(null);
  const [nfcSpoolId, setNfcSpoolId] = useState<string | null>(null);
  const [modal, setModal] = useState<'add' | { spool: FilamentSpool } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [importError, setImportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // CSV import modal
  const [showImportModal, setShowImportModal] = useState(false);
  // Bambu invoice import modal
  const [showBambuImportModal, setShowBambuImportModal] = useState(false);
  // IDs of spools imported from Bambu invoice that have no colorHex
  const [unknownColorIds, setUnknownColorIds] = useState<Set<string>>(new Set());
  // IDs of newly-imported spools that still need a price (costPerSpool === 0)
  const [incompleteImportedIds, setIncompleteImportedIds] = useState<Set<string>>(new Set());
  const [spoolFilter, setSpoolFilter] = useState<'all' | 'incomplete'>('all');
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dismiss banner automatically when all incomplete-imported spools get a price
  useEffect(() => {
    if (incompleteImportedIds.size === 0) return;
    const stillMissing = spools.filter(
      (s) => incompleteImportedIds.has(s.id) && s.costPerSpool === 0,
    );
    if (stillMissing.length === 0) {
      setIncompleteImportedIds(new Set());
      setSpoolFilter('all');
    }
  }, [spools, incompleteImportedIds]);

  // Handle ?writeNFC=true param from NFCScannerModal
  useEffect(() => {
    if (searchParams.get('writeNFC') === 'true') {
      setSearchParams({}, { replace: true });
      showToast('Tap "NFC" on any spool row to write a tag');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(''), 4000);
  }

  function handleCsvImport(rows: ImportableSpool[]) {
    const prevIds = new Set(useFilamentStore.getState().spools.map((s) => s.id));
    for (const row of rows) {
      addSpool(row);
    }
    // Find the IDs that were just created and flag any missing price
    const newIncomplete = useFilamentStore
      .getState()
      .spools.filter((s) => !prevIds.has(s.id) && s.costPerSpool === 0)
      .map((s) => s.id);
    setIncompleteImportedIds(new Set(newIncomplete));
    if (newIncomplete.length > 0) setSpoolFilter('incomplete');
    setShowImportModal(false);
    showToast(`${rows.length} spool${rows.length !== 1 ? 's' : ''} imported successfully`);
  }

  function handleBambuImport(rows: ImportableSpool[]) {
    const prevIds = new Set(useFilamentStore.getState().spools.map((s) => s.id));
    for (const row of rows) addSpool(row);
    const newSpools = useFilamentStore.getState().spools.filter((s) => !prevIds.has(s.id));
    const noHex = newSpools.filter((s) => !s.colorHex).map((s) => s.id);
    if (noHex.length > 0) setUnknownColorIds(new Set(noHex));
    setShowBambuImportModal(false);
    showToast(`${rows.length} spool${rows.length !== 1 ? 's' : ''} imported from Bambu Lab invoice`);
  }

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

  const locations = useLocationStore((s) => s.locations);
  const [viewMode, setViewMode] = useState<'list' | 'location'>('list');
  const [materialFilter, setMaterialFilter] = useState<string>('all');

  const visibleSpools = spools
    .filter((s) => spoolFilter !== 'incomplete' || s.costPerSpool === 0)
    .filter((s) => materialFilter === 'all' || s.material === materialFilter);

  // Build location groups for grouped view
  const locationGroups = (() => {
    if (viewMode !== 'location') return null;
    const byLoc = new Map<string | null, typeof spools>();
    for (const s of visibleSpools) {
      const key = s.locationId ?? null;
      if (!byLoc.has(key)) byLoc.set(key, []);
      byLoc.get(key)!.push(s);
    }
    const groups: { locId: string | null; name: string; type?: string; spools: typeof spools }[] = [];
    for (const loc of locations) {
      if (byLoc.has(loc.id)) {
        groups.push({ locId: loc.id, name: loc.name, type: loc.type, spools: byLoc.get(loc.id)! });
      }
    }
    if (byLoc.has(null)) {
      groups.push({ locId: null, name: 'Unassigned', spools: byLoc.get(null)! });
    }
    return groups;
  })();

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowScanner(true)}
            aria-label="Scan QR code"
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors text-lg"
          >
            📷
          </button>
          <Link
            to="/bulk-labels"
            className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Bulk Labels
          </Link>
          <button
            onClick={() => setShowImportModal(true)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Import CSV
          </button>
          <button
            onClick={() => setShowBambuImportModal(true)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Import from Invoice
          </button>
          <button
            onClick={() => setModal('add')}
            className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
          >
            + Add Spool
          </button>
        </div>
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

      {/* Incomplete-import banner */}
      {incompleteImportedIds.size > 0 && (() => {
        const count = spools.filter(
          (s) => incompleteImportedIds.has(s.id) && s.costPerSpool === 0,
        ).length;
        if (count === 0) return null;
        return (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
            <p className="text-xs font-medium text-orange-700">
              {count} spool{count !== 1 ? 's' : ''} need a purchase price
            </p>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setSpoolFilter('incomplete')}
                className="text-xs font-semibold text-[#f97316] hover:underline"
              >
                Complete now →
              </button>
              <button
                onClick={() => {
                  setIncompleteImportedIds(new Set());
                  setSpoolFilter('all');
                }}
                className="text-xs text-orange-400 hover:text-orange-600 transition-colors"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })()}

      {/* Unknown-color banner (after Bambu invoice import) */}
      {unknownColorIds.size > 0 && (() => {
        const count = spools.filter((s) => unknownColorIds.has(s.id) && !s.colorHex).length;
        if (count === 0) return null;
        return (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium text-amber-700">
              {count} spool{count !== 1 ? 's' : ''} need a color assigned — open each spool to add a hex color
            </p>
            <button
              onClick={() => setUnknownColorIds(new Set())}
              className="text-xs text-amber-400 hover:text-amber-600 transition-colors shrink-0"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        );
      })()}

      {/* Incomplete filter toggle (shown when filtering) */}
      {spoolFilter === 'incomplete' && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs font-medium text-[#f97316] bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-full">
            Showing incomplete only
          </span>
          <button
            onClick={() => setSpoolFilter('all')}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Show all →
          </button>
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

      {/* Material filter + view mode toggle */}
      {spools.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select
            value={materialFilter}
            onChange={(e) => setMaterialFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#f97316] bg-white"
          >
            <option value="all">All materials</option>
            {MATERIAL_CATEGORIES.map((cat) => (
              <optgroup key={cat.group} label={cat.group}>
                {cat.items
                  .filter((m) => spools.some((s) => s.material === m))
                  .map((m) => <option key={m} value={m}>{m}</option>)}
              </optgroup>
            ))}
          </select>

          {locations.length > 0 && (
            <div className="flex items-center gap-1">
              {(['list', 'location'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={[
                    'text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
                    viewMode === mode
                      ? 'bg-[#1e2a3a] text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {mode === 'list' ? 'List' : '📍 By Location'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
      ) : visibleSpools.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl border border-slate-100">
          <p className="text-sm text-slate-500 mb-2">No spools match the current filter.</p>
          <button
            onClick={() => setSpoolFilter('all')}
            className="text-xs text-[#f97316] hover:underline font-medium"
          >
            Show all spools
          </button>
        </div>
      ) : viewMode === 'location' && locationGroups ? (
        <div className="space-y-4">
          {locationGroups.map((group) => (
            <div
              key={group.locId ?? 'unassigned'}
              className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#1e2a3a]">{group.name}</span>
                  {group.type && (
                    <span className="text-[10px] bg-[#1e2a3a]/8 text-[#1e2a3a] px-1.5 py-0.5 rounded-full">
                      {group.type}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400">
                  {group.spools.length} spool{group.spools.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/40">
                      {['Brand', 'Material', 'Color', 'Remaining', 'Weight', 'Cost', 'Cost/g', 'Purchased', ''].map((h) => (
                        <th key={h} className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.spools.map((spool) => {
                      const gpct = spool.weightTotalG > 0 ? (spool.weightRemainingG / spool.weightTotalG) * 100 : 0;
                      const gcpg = filamentCostPerG(spool);
                      return (
                        <tr key={spool.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{spool.brand}</td>
                          <td className="px-4 py-3"><span className="inline-block bg-[#1e2a3a]/10 text-[#1e2a3a] text-xs font-medium px-2 py-0.5 rounded-full">{spool.material}</span></td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{spool.color}</td>
                          <td className="px-4 py-3"><div className="space-y-1"><RemainBar pct={gpct} /><p className="text-[10px] text-slate-400">{spool.weightRemainingG}g / {spool.weightTotalG}g</p></div></td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{spool.weightTotalG}g</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt2(spool.costPerSpool)}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt4(gcpg)}</td>
                          <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{spool.purchasedAt}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {spool.nfcProgrammed && (
                                <span title="NFC tag programmed" className="text-emerald-500 flex items-center">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/>
                                    <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
                                    <circle cx="12" cy="12" r="2"/>
                                    <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/>
                                    <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>
                                  </svg>
                                </span>
                              )}
                              <button onClick={() => setNfcSpoolId(spool.id)} className="text-xs text-violet-500 hover:underline">NFC</button>
                              <button onClick={() => setModal({ spool })} className="text-xs text-[#f97316] hover:underline">Edit</button>
                              <button onClick={() => setDeleteId(spool.id)} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
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
                {visibleSpools.map((spool) => {
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
                          {spool.nfcProgrammed && (
                            <span title="NFC tag programmed" className="text-emerald-500 flex items-center">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/>
                                <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
                                <circle cx="12" cy="12" r="2"/>
                                <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/>
                                <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>
                              </svg>
                            </span>
                          )}
                          <button
                            onClick={() => setNfcSpoolId(spool.id)}
                            className="text-xs text-violet-500 hover:underline"
                          >
                            NFC
                          </button>
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

      {/* Printer Setup — manual AMS spool assignment */}
      <PrinterSetupPanel />

      {/* AMS slot mapping — live MQTT view with auto-match */}
      <AmsMappingSection />

      {/* Data & Backup */}
      <div className="mt-6 bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <p className="text-sm font-semibold text-[#1e2a3a] mb-0.5">Data &amp; Backup</p>
        <p className="text-xs text-slate-400 mb-4">
          Export all app data to a JSON file, or restore from a previous backup.
          Use this to migrate from localhost to production.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={exportAllData}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-[#1e2a3a] text-white hover:bg-[#263548] transition-colors"
          >
            ↓ Export All Data
          </button>
          <button
            onClick={() => { setBackupError(''); backupFileRef.current?.click(); }}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            ↑ Import / Restore Data
          </button>
          <input
            ref={backupFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setBackupError('');
              try {
                const backup = await readBackupFile(file);
                setPendingBackup(backup);
                setShowRestoreConfirm(true);
              } catch (err) {
                setBackupError(err instanceof Error ? err.message : 'Unknown error reading file.');
              }
            }}
          />
        </div>
        {backupError && (
          <p className="mt-3 text-xs text-red-500">{backupError}</p>
        )}
      </div>

      {/* Write NFC modal */}
      {nfcSpoolId && (() => {
        const nfcSpool = spools.find((s) => s.id === nfcSpoolId);
        if (!nfcSpool) return null;
        return (
          <WriteNFCModal
            spool={nfcSpool}
            onClose={() => setNfcSpoolId(null)}
            onMarked={() => {
              markNfcProgrammed(nfcSpoolId);
              setNfcSpoolId(null);
              showToast('NFC tag marked as programmed');
            }}
          />
        );
      })()}

      {/* Add/Edit modal */}
      {modal !== null && (
        <Modal
          title={
            modal === 'add'
              ? 'Add Filament Spool'
              : `${(modal as { spool: FilamentSpool }).spool.brand} ${(modal as { spool: FilamentSpool }).spool.material} — ${(modal as { spool: FilamentSpool }).spool.color}`
          }
          onClose={() => setModal(null)}
        >
          {modal === 'add' ? (
            <SpoolForm
              initial={emptyForm()}
              onSave={handleSave}
              onClose={() => setModal(null)}
            />
          ) : (
            <SpoolEditModal
              spool={(modal as { spool: FilamentSpool }).spool}
              onSave={handleSave}
              onClose={() => setModal(null)}
            />
          )}
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

      {/* Restore confirm */}
      {showRestoreConfirm && pendingBackup && (
        <ConfirmDialog
          message={`This will replace ALL current app data with the backup from ${new Date(pendingBackup.exportedAt).toLocaleString()}. This cannot be undone. Continue?`}
          confirmLabel="Yes, Restore"
          confirmClassName="text-sm px-4 py-2 rounded-lg bg-[#f97316] text-white hover:bg-[#ea6d0f] transition-colors font-medium"
          onConfirm={() => {
            importAllData(pendingBackup);
            setShowRestoreConfirm(false);
            setPendingBackup(null);
            window.location.reload();
          }}
          onCancel={() => {
            setShowRestoreConfirm(false);
            setPendingBackup(null);
          }}
        />
      )}

      {/* CSV Import modal */}
      {showImportModal && (
        <Modal title="Import Filament CSV" onClose={() => setShowImportModal(false)}>
          <FilamentImportPanel
            existingSpools={spools}
            onImport={handleCsvImport}
            onClose={() => setShowImportModal(false)}
          />
        </Modal>
      )}

      {/* Bambu Invoice Import modal */}
      {showBambuImportModal && (
        <Modal title="Import from Bambu Lab Invoice" onClose={() => setShowBambuImportModal(false)}>
          <BambuInvoiceImportPanel
            onImport={handleBambuImport}
            onClose={() => setShowBambuImportModal(false)}
          />
        </Modal>
      )}

      {/* Success toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] bg-[#1e2a3a] text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl pointer-events-none lg:bottom-6">
          {toast}
        </div>
      )}

      {/* QR scanner */}
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} />}
    </div>
  );
}
