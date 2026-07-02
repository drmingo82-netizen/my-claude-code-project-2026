import { useState, useRef, useMemo } from 'react';
import { useProductStore } from '../stores/productStore';
import { useFilamentStore } from '../stores/filamentStore';
import type { Product } from '../types';
import { unitCost, unitProfit, unitMarginPct } from '../lib/metrics';
import { exportToCsv, parseCsv } from '../lib/csv';
import Modal, { ModalFooter } from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import FormField from '../components/ui/FormField';
import { parse3MF, formatPrintTime, type Parsed3MF } from '../lib/parse3mf';
import ProductLabelPanel from '../components/labels/ProductLabelPanel';

const CATEGORIES = [
  'Organization', 'Desk Accessories', 'Home Decor', 'Toys & Games',
  'Kitchen', 'Tools & Holders', 'Outdoor', 'Art & Figurines', 'Custom', 'Other',
];

const fmtC = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function marginColor(pct: number) {
  if (pct >= 40) return 'text-emerald-600 bg-emerald-50';
  if (pct >= 20) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

// ── Form ─────────────────────────────────────────────────────────────────────

type FormData = Omit<Product, 'id'>;

const emptyForm = (): FormData => ({
  sku: '',
  name: '',
  category: 'Other',
  filamentSpoolId: '',
  filamentUsedG: 0,
  printTimeHours: 0,
  laborHours: 0,
  laborRatePerHour: 20,
  otherCosts: 0,
  sellingPrice: 0,
  notes: '',
});

function validate(f: FormData): Partial<Record<keyof FormData, string>> {
  const e: Partial<Record<keyof FormData, string>> = {};
  if (!f.name.trim()) e.name = 'Required';
  if (!f.sku.trim()) e.sku = 'Required';
  if (f.filamentUsedG < 0) e.filamentUsedG = 'Cannot be negative';
  if (f.printTimeHours < 0) e.printTimeHours = 'Cannot be negative';
  if (f.laborHours < 0) e.laborHours = 'Cannot be negative';
  if (f.laborRatePerHour < 0) e.laborRatePerHour = 'Cannot be negative';
  if (f.otherCosts < 0) e.otherCosts = 'Cannot be negative';
  if (f.sellingPrice <= 0) e.sellingPrice = 'Must be > 0';
  return e;
}

function generateSku(name: string, existing: string[]): string {
  const base = 'TC-' + name.trim().slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
  let n = existing.length + 1;
  let candidate = `${base}${String(n).padStart(3, '0')}`;
  while (existing.includes(candidate)) {
    n++;
    candidate = `${base}${String(n).padStart(3, '0')}`;
  }
  return candidate;
}

interface ProductFormProps {
  initial: FormData;
  existingSkus: string[];
  onSave: (data: FormData) => void;
  onClose: () => void;
}

function ProductForm({ initial, existingSkus, onSave, onClose }: ProductFormProps) {
  const spools = useFilamentStore((s) => s.spools);
  const [form, setForm] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const [parsed3MF, setParsed3MF] = useState<Parsed3MF | null>(null);
  const [parsing3MF, setParsing3MF] = useState(false);
  const [parseError, setParseError] = useState('');
  const fileRef3MF = useRef<HTMLInputElement>(null);

  async function handle3MFFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing3MF(true);
    setParseError('');
    const result = await parse3MF(file);
    if (result) {
      setParsed3MF(result);
    } else {
      setParseError('Could not read 3MF data — enter values manually.');
    }
    setParsing3MF(false);
    e.target.value = '';
  }

  function apply3MF() {
    if (!parsed3MF) return;
    set('filamentUsedG', Math.round(parsed3MF.totalGrams * 10) / 10);
    set('printTimeHours', parsed3MF.printTimeHours);
    setParsed3MF(null);
  }

  const selectedSpool = spools.find((s) => s.id === form.filamentSpoolId);
  const filamentCost = selectedSpool
    ? (selectedSpool.costPerSpool / selectedSpool.weightTotalG) * form.filamentUsedG
    : 0;
  const laborCost = form.laborHours * form.laborRatePerHour;
  const totalCost = filamentCost + laborCost + form.otherCosts;
  const profit = form.sellingPrice - totalCost;
  const margin = form.sellingPrice > 0 ? (profit / form.sellingPrice) * 100 : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FormField
            label="SKU"
            value={form.sku}
            onChange={(e) => set('sku', (e.target as HTMLInputElement).value)}
            placeholder="TC-001"
            error={errors.sku}
          />
          <button
            type="button"
            onClick={() => set('sku', generateSku(form.name, existingSkus))}
            className="mt-1 text-[10px] text-[#f97316] hover:underline"
          >
            Auto-generate
          </button>
        </div>
        <FormField
          as="select"
          label="Category"
          value={form.category}
          onChange={(e) => set('category', (e.target as HTMLSelectElement).value)}
          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
      </div>

      <FormField
        label="Product Name"
        value={form.name}
        onChange={(e) => set('name', (e.target as HTMLInputElement).value)}
        placeholder="e.g. Cable Management Clips"
        error={errors.name}
      />

      {/* Filament */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-slate-600">Filament Spool</label>
          <button
            type="button"
            onClick={() => fileRef3MF.current?.click()}
            disabled={parsing3MF}
            className="text-[10px] font-medium text-[#f97316] hover:underline disabled:opacity-50"
          >
            {parsing3MF ? 'Reading…' : '↑ Import 3MF'}
          </button>
        </div>
        <input ref={fileRef3MF} type="file" accept=".3mf" className="hidden" onChange={handle3MFFile} />
        <select
          value={form.filamentSpoolId}
          onChange={(e) => set('filamentSpoolId', e.target.value)}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
        >
          <option value="">— No filament —</option>
          {spools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.brand} {s.material} {s.color} (${(s.costPerSpool / s.weightTotalG).toFixed(4)}/g)
            </option>
          ))}
        </select>
        {spools.length === 0 && (
          <p className="text-[10px] text-slate-400 mt-1">Add spools in Filament Inventory first.</p>
        )}
      </div>

      {parsed3MF && (
        <div className="rounded-lg border border-[#f97316]/30 bg-orange-50 px-3 py-2.5 text-xs">
          <p className="font-medium text-[#1e2a3a] mb-1.5">
            {'Found: '}
            {parsed3MF.filamentPerSlot.map((f) => `${f.grams.toFixed(1)}g slot ${f.slot}`).join(' / ')}
            {' · Print time: '}
            {formatPrintTime(parsed3MF.printTimeHours)}
            {' — Apply?'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={apply3MF}
              className="px-3 py-1 rounded-lg bg-[#f97316] text-white font-medium text-xs hover:bg-[#ea6d0f] transition-colors"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setParsed3MF(null)}
              className="px-3 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-50 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {parseError && <p className="text-xs text-red-500">{parseError}</p>}

      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Filament Used (g)"
          type="number"
          min={0}
          step={0.1}
          value={form.filamentUsedG}
          onChange={(e) => set('filamentUsedG', Number((e.target as HTMLInputElement).value))}
          error={errors.filamentUsedG}
        />
        <FormField
          label="Print Time (hrs)"
          type="number"
          min={0}
          step={0.25}
          value={form.printTimeHours}
          onChange={(e) => set('printTimeHours', Number((e.target as HTMLInputElement).value))}
          error={errors.printTimeHours}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Labor (hrs)"
          type="number"
          min={0}
          step={0.25}
          value={form.laborHours}
          onChange={(e) => set('laborHours', Number((e.target as HTMLInputElement).value))}
          error={errors.laborHours}
        />
        <FormField
          label="Labor Rate ($/hr)"
          type="number"
          min={0}
          step={0.5}
          value={form.laborRatePerHour}
          onChange={(e) => set('laborRatePerHour', Number((e.target as HTMLInputElement).value))}
          error={errors.laborRatePerHour}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Other Costs ($)"
          type="number"
          min={0}
          step={0.01}
          value={form.otherCosts}
          onChange={(e) => set('otherCosts', Number((e.target as HTMLInputElement).value))}
          error={errors.otherCosts}
        />
        <FormField
          label="Selling Price ($)"
          type="number"
          min={0.01}
          step={0.01}
          value={form.sellingPrice}
          onChange={(e) => set('sellingPrice', Number((e.target as HTMLInputElement).value))}
          error={errors.sellingPrice}
        />
      </div>

      <FormField
        as="textarea"
        label="Notes (optional)"
        value={form.notes ?? ''}
        onChange={(e) => set('notes', (e.target as HTMLTextAreaElement).value)}
        placeholder="Materials, finish, special instructions…"
      />

      {/* Live cost breakdown */}
      <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 text-xs">
        <p className="font-semibold text-slate-600 mb-2">Cost Breakdown</p>
        <div className="flex justify-between text-slate-500">
          <span>Filament</span>
          <span>{fmtC(filamentCost)}</span>
        </div>
        <div className="flex justify-between text-slate-500">
          <span>Labor</span>
          <span>{fmtC(laborCost)}</span>
        </div>
        <div className="flex justify-between text-slate-500">
          <span>Other</span>
          <span>{fmtC(form.otherCosts)}</span>
        </div>
        <div className="border-t border-slate-200 pt-1.5 flex justify-between font-semibold text-slate-700">
          <span>Total Cost</span>
          <span>{fmtC(totalCost)}</span>
        </div>
        <div className="flex justify-between font-semibold text-slate-700">
          <span>Profit / unit</span>
          <span className={profit >= 0 ? 'text-emerald-600' : 'text-red-500'}>{fmtC(profit)}</span>
        </div>
        <div className="flex justify-between font-semibold text-slate-700">
          <span>Margin</span>
          <span className={margin >= 20 ? 'text-emerald-600' : 'text-red-500'}>{margin.toFixed(1)}%</span>
        </div>
      </div>

      <ModalFooter>
        <div className="flex gap-3">
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
            Save Product
          </button>
        </div>
      </ModalFooter>
    </form>
  );
}

// ── Product edit modal with Details / Labels tabs ─────────────────────────────

type ProductTab = 'details' | 'labels';

function ProductEditModal({
  product,
  existingSkus,
  onSave,
  onClose,
}: {
  product: Product;
  existingSkus: string[];
  onSave: (d: FormData) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ProductTab>('details');

  return (
    <div>
      <div className="flex gap-5 border-b border-slate-100 mb-4 -mt-1">
        {(['details', 'labels'] as ProductTab[]).map((t) => (
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
        <ProductForm
          initial={{
            sku: product.sku,
            name: product.name,
            category: product.category,
            filamentSpoolId: product.filamentSpoolId ?? '',
            filamentUsedG: product.filamentUsedG,
            printTimeHours: product.printTimeHours,
            laborHours: product.laborHours,
            laborRatePerHour: product.laborRatePerHour,
            otherCosts: product.otherCosts,
            sellingPrice: product.sellingPrice,
            notes: product.notes ?? '',
          }}
          existingSkus={existingSkus}
          onSave={onSave}
          onClose={onClose}
        />
      )}
      {tab === 'labels' && <ProductLabelPanel product={product} />}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Products() {
  const products = useProductStore((s) => s.products);
  const { addProduct, updateProduct, deleteProduct, importProducts } = useProductStore();
  const spools = useFilamentStore((s) => s.spools);

  const [modal, setModal] = useState<'add' | { product: Product } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [importError, setImportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const existingSkus = products.map((p) => p.sku);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      const matchSearch =
        !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      const matchCat = !filterCat || p.category === filterCat;
      return matchSearch && matchCat;
    });
  }, [products, search, filterCat]);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort(),
    [products]
  );

  function handleSave(data: FormData) {
    if (modal === 'add') {
      addProduct(data);
    } else if (modal && typeof modal === 'object') {
      updateProduct((modal as { product: Product }).product.id, data);
    }
    setModal(null);
  }

  function handleExport() {
    exportToCsv(
      'product-catalog.csv',
      products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        filamentSpoolId: p.filamentSpoolId ?? '',
        filamentUsedG: p.filamentUsedG,
        printTimeHours: p.printTimeHours,
        laborHours: p.laborHours,
        laborRatePerHour: p.laborRatePerHour,
        otherCosts: p.otherCosts,
        sellingPrice: p.sellingPrice,
        notes: p.notes ?? '',
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
        const parsed: Product[] = rows.map((r) => ({
          id: r.id || crypto.randomUUID(),
          sku: r.sku ?? '',
          name: r.name ?? '',
          category: r.category ?? 'Other',
          filamentSpoolId: r.filamentSpoolId || undefined,
          filamentUsedG: Number(r.filamentUsedG) || 0,
          printTimeHours: Number(r.printTimeHours) || 0,
          laborHours: Number(r.laborHours) || 0,
          laborRatePerHour: Number(r.laborRatePerHour) || 20,
          otherCosts: Number(r.otherCosts) || 0,
          sellingPrice: Number(r.sellingPrice) || 0,
          notes: r.notes ?? '',
        }));
        if (importMode === 'replace') {
          importProducts(parsed);
        } else {
          importProducts([...products, ...parsed]);
        }
        setImportError('');
      } catch {
        setImportError('Could not parse CSV.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // Summary stats
  const avgMargin =
    products.length > 0
      ? products.reduce((sum, p) => sum + unitMarginPct(p, spools), 0) / products.length
      : 0;
  const bestProduct = products.length
    ? products.reduce((best, p) =>
        unitProfit(p, spools) > unitProfit(best, spools) ? p : best
      )
    : null;

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="hidden lg:block text-xl font-bold text-[#1e2a3a]">Product Catalog</h1>
          <p className="text-xs text-slate-400 lg:mt-0.5">{products.length} SKU{products.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setModal('add')}
          className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
        >
          + Add Product
        </button>
      </div>

      {/* Summary cards */}
      {products.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">Total SKUs</p>
            <p className="text-lg font-bold text-[#1e2a3a]">{products.length}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">Avg Margin</p>
            <p className={`text-lg font-bold ${avgMargin >= 20 ? 'text-emerald-600' : 'text-red-500'}`}>
              {avgMargin.toFixed(1)}%
            </p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center">
            <p className="text-xs text-slate-400 mb-0.5">Best Profit/Unit</p>
            <p className="text-lg font-bold text-[#1e2a3a]">
              {bestProduct ? fmtC(unitProfit(bestProduct, spools)) : '—'}
            </p>
            {bestProduct && (
              <p className="text-[10px] text-slate-400 truncate">{bestProduct.name}</p>
            )}
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-2 mb-2">
        <input
          type="search"
          placeholder="Search name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
        />
        {categories.length > 0 && (
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#f97316]"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {/* Import/export toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={handleExport}
          disabled={products.length === 0}
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
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-100">
          <div className="text-4xl mb-3">🖨️</div>
          <p className="text-sm font-medium text-slate-600 mb-1">No products yet</p>
          <p className="text-xs text-slate-400 mb-4">Add your first SKU to start calculating costs and margins.</p>
          <button
            onClick={() => setModal('add')}
            className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
          >
            + Add Product
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">
          No products match your search.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[780px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['SKU', 'Name', 'Category', 'Filament', 'Sell Price', 'Unit Cost', 'Profit', 'Margin', ''].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const spool = spools.find((s) => s.id === product.filamentSpoolId);
                  const cost = unitCost(product, spools);
                  const profit = unitProfit(product, spools);
                  const margin = unitMarginPct(product, spools);
                  return (
                    <tr
                      key={product.id}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{product.sku}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap max-w-[180px]">
                        <span className="truncate block">{product.name}</span>
                        {product.notes && (
                          <span className="text-[10px] text-slate-400 truncate block">{product.notes}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block bg-[#1e2a3a]/8 text-[#1e2a3a] text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                          {product.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {spool
                          ? `${spool.brand} ${spool.material} ${spool.color}`
                          : <span className="text-slate-300">—</span>
                        }
                        {product.filamentUsedG > 0 && (
                          <span className="text-slate-300 ml-1">({product.filamentUsedG}g)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">{fmtC(product.sellingPrice)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtC(cost)}</td>
                      <td className={`px-4 py-3 font-semibold whitespace-nowrap ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {fmtC(profit)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${marginColor(margin)}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setModal({ product })}
                            className="text-xs text-[#f97316] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteId(product.id)}
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
          {filtered.length < products.length && (
            <div className="px-4 py-2 border-t border-slate-50 text-xs text-slate-400">
              Showing {filtered.length} of {products.length} products
            </div>
          )}
        </div>
      )}

      {/* Add/Edit modal */}
      {modal !== null && (
        <Modal
          title={
            modal === 'add'
              ? 'Add Product'
              : (modal as { product: Product }).product.name
          }
          onClose={() => setModal(null)}
        >
          {modal === 'add' ? (
            <ProductForm
              initial={emptyForm()}
              existingSkus={existingSkus}
              onSave={handleSave}
              onClose={() => setModal(null)}
            />
          ) : (
            <ProductEditModal
              product={(modal as { product: Product }).product}
              existingSkus={existingSkus}
              onSave={handleSave}
              onClose={() => setModal(null)}
            />
          )}
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <ConfirmDialog
          message="Delete this product? This cannot be undone."
          onConfirm={() => { deleteProduct(deleteId); setDeleteId(null); }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
