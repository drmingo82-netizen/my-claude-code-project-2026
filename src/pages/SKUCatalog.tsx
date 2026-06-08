import { useState, useMemo } from 'react';
import { useSKUStore } from '../stores/skuStore';
import { useNotificationStore } from '../stores/notificationStore';
import type { SKUItem, SKUCategory, SKUStatus } from '../types';
import { exportToCsv } from '../lib/csv';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import FormField from '../components/ui/FormField';

const CATEGORIES: SKUCategory[] = ['Animal', 'Fidget', 'Keychain', 'Organizational', 'Novelty'];
const STATUSES: SKUStatus[] = ['Active', 'In Development', 'Inactive'];

const fmtC = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function statusBadge(status: SKUStatus) {
  switch (status) {
    case 'Active':       return 'bg-emerald-100 text-emerald-700';
    case 'In Development': return 'bg-amber-100 text-amber-700';
    case 'Inactive':     return 'bg-slate-100 text-slate-500';
  }
}

// ── Bulk pricing logic ────────────────────────────────────────────────────────

function computeBulkPrice(item: SKUItem): number | undefined {
  const n = item.name.toLowerCase();
  switch (item.category) {
    case 'Animal':
      if (n.includes('tiny'))   return 1.50;
      if (n.includes('small'))  return 1.50;
      if (n.includes('medium')) return 2.50;
      if (n.includes('large'))  return 5.00;
      return undefined;
    case 'Fidget':
      if (n.includes('extra large')) return 15.00;
      if (n.includes('large'))       return 10.00;
      if (n.includes('small'))       return 5.00;
      if (n.includes('medium'))      return 7.00;
      return 7.00;
    case 'Keychain':      return 10.00;
    case 'Organizational': return 15.00;
    case 'Novelty':       return 7.00;
  }
}

interface BulkPreviewRow {
  id: string;
  sku: string;
  name: string;
  category: SKUCategory;
  price: number;
}

function buildBulkPreview(skus: SKUItem[]): BulkPreviewRow[] {
  return skus
    .filter((s) => s.salePrice === undefined || s.salePrice === null)
    .flatMap((s) => {
      const price = computeBulkPrice(s);
      return price !== undefined ? [{ id: s.id, sku: s.sku, name: s.name, category: s.category, price }] : [];
    });
}

// ── Bulk Price modal ──────────────────────────────────────────────────────────

interface BulkPriceModalProps {
  skus: SKUItem[];
  onApply: (rows: BulkPreviewRow[]) => void;
  onClose: () => void;
}

function BulkPriceModal({ skus, onApply, onClose }: BulkPriceModalProps) {
  const preview = useMemo(() => buildBulkPreview(skus), [skus]);

  const byCategory = useMemo(() => {
    const map = new Map<SKUCategory, BulkPreviewRow[]>();
    for (const row of preview) {
      const arr = map.get(row.category) ?? [];
      arr.push(row);
      map.set(row.category, arr);
    }
    return map;
  }, [preview]);

  if (preview.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="text-3xl mb-3">✅</div>
          <p className="text-sm font-medium text-slate-700">All SKUs already have prices set.</p>
          <p className="text-xs text-slate-400 mt-1">Nothing to update.</p>
        </div>
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        The following <span className="font-semibold text-[#1e2a3a]">{preview.length} SKU{preview.length !== 1 ? 's' : ''}</span> have
        no sale price and will be updated. SKUs with prices already set are skipped.
      </p>

      <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[52vh] overflow-y-auto">
        {CATEGORIES.filter((cat) => byCategory.has(cat)).map((cat) => {
          const rows = byCategory.get(cat)!;
          return (
            <div key={cat}>
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 sticky top-0">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {cat} — {rows.length} SKU{rows.length !== 1 ? 's' : ''}
                </span>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-50 last:border-0 ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}
                    >
                      <td className="px-4 py-2 font-mono text-slate-400 whitespace-nowrap w-20">{row.sku}</td>
                      <td className="px-4 py-2 text-slate-700">{row.name}</td>
                      <td className="px-4 py-2 text-right font-semibold text-emerald-600 whitespace-nowrap">
                        {fmtC(row.price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onApply(preview)}
          className="flex-1 py-2.5 rounded-lg bg-[#f97316] text-white text-sm font-medium hover:bg-[#ea6d0f] transition-colors"
        >
          Apply Prices
        </button>
      </div>
    </div>
  );
}

// ── SKU form ──────────────────────────────────────────────────────────────────

type FormData = Omit<SKUItem, 'id'>;

const emptyForm = (): FormData => ({
  sku: '',
  name: '',
  category: 'Fidget',
  quantity: 0,
  status: 'Active',
  salePrice: undefined,
  filamentCost: undefined,
  printTimeMinutes: undefined,
  weightGrams: undefined,
  amsSlots: undefined,
  notes: '',
});

function toFormData(item: SKUItem): FormData {
  return {
    sku: item.sku,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    status: item.status,
    salePrice: item.salePrice,
    filamentCost: item.filamentCost,
    printTimeMinutes: item.printTimeMinutes,
    weightGrams: item.weightGrams,
    amsSlots: item.amsSlots,
    notes: item.notes ?? '',
  };
}

function validate(f: FormData): Partial<Record<keyof FormData, string>> {
  const e: Partial<Record<keyof FormData, string>> = {};
  if (!f.sku.trim()) e.sku = 'Required';
  if (!f.name.trim()) e.name = 'Required';
  if (f.quantity < 0) e.quantity = 'Cannot be negative';
  return e;
}

interface SKUFormProps {
  initial: FormData;
  onSave: (data: FormData) => void;
  onClose: () => void;
}

function SKUForm({ initial, onSave, onClose }: SKUFormProps) {
  const [form, setForm] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setOpt = (key: keyof FormData, raw: string) => {
    const n = raw === '' ? undefined : Number(raw);
    setForm((f) => ({ ...f, [key]: n }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form);
  }

  const margin =
    form.salePrice && form.filamentCost && form.salePrice > 0
      ? ((form.salePrice - form.filamentCost) / form.salePrice) * 100
      : null;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="SKU"
          value={form.sku}
          onChange={(e) => set('sku', (e.target as HTMLInputElement).value)}
          placeholder="ANM-001"
          error={errors.sku}
        />
        <FormField
          as="select"
          label="Category"
          value={form.category}
          onChange={(e) => set('category', (e.target as HTMLSelectElement).value as SKUCategory)}
          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
      </div>

      <FormField
        label="Name"
        value={form.name}
        onChange={(e) => set('name', (e.target as HTMLInputElement).value)}
        placeholder="e.g. Medium Bees"
        error={errors.name}
      />

      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Quantity"
          type="number"
          min={0}
          value={form.quantity}
          onChange={(e) => set('quantity', Number((e.target as HTMLInputElement).value))}
          error={errors.quantity}
        />
        <FormField
          as="select"
          label="Status"
          value={form.status}
          onChange={(e) => set('status', (e.target as HTMLSelectElement).value as SKUStatus)}
          options={STATUSES.map((s) => ({ value: s, label: s }))}
        />
      </div>

      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">
        Optional Details
      </p>

      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Sale Price ($)"
          type="number"
          min={0}
          step={0.01}
          value={form.salePrice ?? ''}
          onChange={(e) => setOpt('salePrice', (e.target as HTMLInputElement).value)}
          placeholder="—"
        />
        <FormField
          label="Filament Cost ($)"
          type="number"
          min={0}
          step={0.01}
          value={form.filamentCost ?? ''}
          onChange={(e) => setOpt('filamentCost', (e.target as HTMLInputElement).value)}
          placeholder="—"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <FormField
          label="Print Time (min)"
          type="number"
          min={0}
          value={form.printTimeMinutes ?? ''}
          onChange={(e) => setOpt('printTimeMinutes', (e.target as HTMLInputElement).value)}
          placeholder="—"
        />
        <FormField
          label="Weight (g)"
          type="number"
          min={0}
          step={0.1}
          value={form.weightGrams ?? ''}
          onChange={(e) => setOpt('weightGrams', (e.target as HTMLInputElement).value)}
          placeholder="—"
        />
        <FormField
          label="AMS Slots"
          type="number"
          min={1}
          max={8}
          value={form.amsSlots ?? ''}
          onChange={(e) => setOpt('amsSlots', (e.target as HTMLInputElement).value)}
          placeholder="—"
        />
      </div>

      <FormField
        as="textarea"
        label="Notes (optional)"
        value={form.notes ?? ''}
        onChange={(e) => set('notes', (e.target as HTMLTextAreaElement).value)}
        placeholder="Colors, variants, print notes…"
      />

      {margin !== null && (
        <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
          <div className="flex justify-between text-slate-500">
            <span>Filament Cost</span>
            <span>{fmtC(form.filamentCost!)}</span>
          </div>
          <div className="flex justify-between font-semibold text-slate-700">
            <span>Margin</span>
            <span className={margin >= 40 ? 'text-emerald-600' : margin >= 20 ? 'text-amber-600' : 'text-red-500'}>
              {margin.toFixed(1)}%
            </span>
          </div>
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
          Save SKU
        </button>
      </div>
    </form>
  );
}

// ── Detail slide-over ─────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 shrink-0">{label}</span>
      <span className="text-xs font-medium text-slate-700 text-right">{value}</span>
    </div>
  );
}

interface DetailPanelProps {
  item: SKUItem;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function DetailPanel({ item, onEdit, onDelete, onClose }: DetailPanelProps) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="font-mono text-xs text-slate-400">{item.sku}</p>
            <h2 className="text-base font-semibold text-[#1e2a3a] leading-tight">{item.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none p-1 -mr-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusBadge(item.status)}`}>
              {item.status}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
              {item.category}
            </span>
          </div>

          <div className="bg-slate-50 rounded-xl p-3">
            <DetailRow label="Quantity" value={item.quantity} />
            <DetailRow label="Sale Price" value={item.salePrice !== undefined ? fmtC(item.salePrice) : undefined} />
            <DetailRow label="Filament Cost" value={item.filamentCost !== undefined ? fmtC(item.filamentCost) : undefined} />
            {item.salePrice && item.filamentCost ? (
              <DetailRow
                label="Margin"
                value={`${(((item.salePrice - item.filamentCost) / item.salePrice) * 100).toFixed(1)}%`}
              />
            ) : null}
            <DetailRow label="Print Time" value={item.printTimeMinutes !== undefined ? `${item.printTimeMinutes} min` : undefined} />
            <DetailRow label="Weight" value={item.weightGrams !== undefined ? `${item.weightGrams} g` : undefined} />
            <DetailRow label="AMS Slots" value={item.amsSlots !== undefined ? item.amsSlots : undefined} />
          </div>

          {item.notes && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Notes</p>
              <p className="text-sm text-slate-600 leading-relaxed">{item.notes}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button
            onClick={onDelete}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-red-500 hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={onEdit}
            className="flex-1 py-2 rounded-lg bg-[#f97316] text-white text-sm font-medium hover:bg-[#ea6d0f] transition-colors"
          >
            Edit SKU
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SKUCatalog() {
  const skus = useSKUStore((s) => s.skus);
  const { addSKU, updateSKU, deleteSKU } = useSKUStore();
  const addToast = useNotificationStore((s) => s.addToast);

  const [modal, setModal] = useState<'add' | { item: SKUItem } | null>(null);
  const [showBulkPrice, setShowBulkPrice] = useState(false);
  const [detail, setDetail] = useState<SKUItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<SKUCategory | ''>('');
  const [filterStatus, setFilterStatus] = useState<SKUStatus | ''>('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return skus.filter((s) => {
      const matchSearch = !q || s.name.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q);
      const matchCat = !filterCat || s.category === filterCat;
      const matchStatus = !filterStatus || s.status === filterStatus;
      return matchSearch && matchCat && matchStatus;
    });
  }, [skus, search, filterCat, filterStatus]);

  const totalQty = skus.reduce((sum, s) => sum + s.quantity, 0);
  const activeCount = skus.filter((s) => s.status === 'Active').length;
  const devCount = skus.filter((s) => s.status === 'In Development').length;

  function handleSave(data: FormData) {
    if (modal === 'add') {
      addSKU(data);
    } else if (modal && typeof modal === 'object') {
      updateSKU(modal.item.id, data);
      if (detail?.id === modal.item.id) {
        setDetail((prev) => prev ? { ...prev, ...data } : null);
      }
    }
    setModal(null);
  }

  function handleBulkApply(rows: BulkPreviewRow[]) {
    for (const row of rows) {
      updateSKU(row.id, { salePrice: row.price });
    }
    setShowBulkPrice(false);
    addToast(`✅ Updated prices for ${rows.length} SKU${rows.length !== 1 ? 's' : ''}`);
  }

  function handleDeleteConfirm() {
    if (!deleteId) return;
    deleteSKU(deleteId);
    if (detail?.id === deleteId) setDetail(null);
    setDeleteId(null);
  }

  function handleExport() {
    exportToCsv(
      'sku-catalog.csv',
      skus.map((s) => ({
        sku: s.sku,
        name: s.name,
        category: s.category,
        quantity: s.quantity,
        status: s.status,
        salePrice: s.salePrice ?? '',
        filamentCost: s.filamentCost ?? '',
        printTimeMinutes: s.printTimeMinutes ?? '',
        weightGrams: s.weightGrams ?? '',
        amsSlots: s.amsSlots ?? '',
        notes: s.notes ?? '',
      }))
    );
  }

  const editingItem = modal && typeof modal === 'object' ? modal.item : null;

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="hidden lg:block text-xl font-bold text-[#1e2a3a]">SKU Catalog</h1>
          <p className="text-xs text-slate-400 lg:mt-0.5">{skus.length} SKU{skus.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={skus.length === 0}
            className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
          >
            ↓ Export CSV
          </button>
          <button
            onClick={() => setShowBulkPrice(true)}
            disabled={skus.length === 0}
            className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
          >
            Bulk Price
          </button>
          <button
            onClick={() => setModal('add')}
            className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
          >
            + Add SKU
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {skus.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">Total SKUs</p>
            <p className="text-lg font-bold text-[#1e2a3a]">{skus.length}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">Total Qty</p>
            <p className="text-lg font-bold text-[#1e2a3a]">{totalQty}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">Active</p>
            <p className="text-lg font-bold text-emerald-600">{activeCount}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">In Dev</p>
            <p className="text-lg font-bold text-amber-500">{devCount}</p>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="search"
          placeholder="Search name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
        />
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value as SKUCategory | '')}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#f97316]"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as SKUStatus | '')}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#f97316]"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {skus.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-100">
          <div className="text-4xl mb-3">🏷️</div>
          <p className="text-sm font-medium text-slate-600 mb-1">No SKUs yet</p>
          <p className="text-xs text-slate-400 mb-4">Add your first SKU to start tracking inventory.</p>
          <button
            onClick={() => setModal('add')}
            className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
          >
            + Add SKU
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">
          No SKUs match your search or filters.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['SKU', 'Name', 'Category', 'Qty', 'Sale Price', 'Status', ''].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setDetail(item)}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">{item.sku}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px]">
                      <span className="truncate block">{item.name}</span>
                      {item.notes && (
                        <span className="text-[10px] text-slate-400 truncate block">{item.notes}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-block bg-[#1e2a3a]/8 text-[#1e2a3a] text-xs px-2 py-0.5 rounded-full">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">{item.quantity}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {item.salePrice !== undefined ? fmtC(item.salePrice) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setModal({ item })} className="text-xs text-[#f97316] hover:underline">
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
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length < skus.length && (
            <div className="px-4 py-2 border-t border-slate-50 text-xs text-slate-400">
              Showing {filtered.length} of {skus.length} SKUs
            </div>
          )}
        </div>
      )}

      {/* Bulk Price modal */}
      {showBulkPrice && (
        <Modal title="Bulk Price by Category" onClose={() => setShowBulkPrice(false)}>
          <BulkPriceModal
            skus={skus}
            onApply={handleBulkApply}
            onClose={() => setShowBulkPrice(false)}
          />
        </Modal>
      )}

      {/* Add / Edit modal */}
      {modal !== null && (
        <Modal
          title={modal === 'add' ? 'Add SKU' : editingItem!.name}
          onClose={() => setModal(null)}
        >
          <SKUForm
            initial={modal === 'add' ? emptyForm() : toFormData(editingItem!)}
            onSave={handleSave}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}

      {/* Detail slide-over */}
      {detail && (
        <DetailPanel
          item={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { setModal({ item: detail }); setDetail(null); }}
          onDelete={() => { setDeleteId(detail.id); setDetail(null); }}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <ConfirmDialog
          message="Delete this SKU? This cannot be undone."
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
