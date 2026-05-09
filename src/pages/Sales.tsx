import { useState, useMemo } from 'react';
import { useSalesStore } from '../stores/salesStore';
import { useProductStore } from '../stores/productStore';
import { useFilamentStore } from '../stores/filamentStore';
import type { SaleEntry } from '../types';
import { unitCost } from '../lib/metrics';
import { exportToCsv } from '../lib/csv';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';

const PLATFORMS = ['Etsy', 'Local / Market', 'eBay', 'Amazon', 'Shopify', 'Facebook', 'Other'];

const fmtC = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

const today = () => new Date().toISOString().slice(0, 10);

const monthKey = (iso: string) => iso.slice(0, 7); // "2026-05"
const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', {
    month: 'long', year: 'numeric',
  });
};

// ── Form ─────────────────────────────────────────────────────────────────────

type FormData = Omit<SaleEntry, 'id'>;

const emptyForm = (defaultProductId = ''): FormData => ({
  productId: defaultProductId,
  quantity: 1,
  salePrice: 0,
  soldAt: today(),
  platform: 'Etsy',
});

function validate(f: FormData) {
  const e: Partial<Record<keyof FormData, string>> = {};
  if (!f.productId) e.productId = 'Select a product';
  if (f.quantity < 1 || !Number.isInteger(f.quantity)) e.quantity = 'Must be a whole number ≥ 1';
  if (f.salePrice <= 0) e.salePrice = 'Must be > 0';
  if (!f.soldAt) e.soldAt = 'Required';
  return e;
}

const fieldCls =
  'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent transition';

interface SaleFormProps {
  initial: FormData;
  onSave: (data: FormData) => void;
  onClose: () => void;
}

function SaleForm({ initial, onSave, onClose }: SaleFormProps) {
  const products = useProductStore((s) => s.products);
  const spools = useFilamentStore((s) => s.spools);
  const [form, setForm] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const product = products.find((p) => p.id === form.productId);
  const cost = product ? unitCost(product, spools) : 0;
  const totalRevenue = form.salePrice * form.quantity;
  const totalProfit = (form.salePrice - cost) * form.quantity;

  function handleProductChange(id: string) {
    const p = products.find((pr) => pr.id === id);
    setForm((f) => ({ ...f, productId: id, salePrice: p ? p.sellingPrice : f.salePrice }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Product */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Product</label>
        <select
          value={form.productId}
          onChange={(e) => handleProductChange(e.target.value)}
          className={fieldCls}
        >
          <option value="">— Select a product —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
          ))}
        </select>
        {errors.productId && <p className="text-xs text-red-500 mt-1">{errors.productId}</p>}
        {products.length === 0 && (
          <p className="text-[10px] text-slate-400 mt-1">Add products in the Product Catalog first.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Quantity */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Quantity</label>
          <input
            type="number" min={1} step={1} value={form.quantity}
            onChange={(e) => set('quantity', Math.max(1, Math.round(Number(e.target.value))))}
            className={fieldCls}
          />
          {errors.quantity && <p className="text-xs text-red-500 mt-1">{errors.quantity}</p>}
        </div>

        {/* Sale price */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Sale Price ($)
            {product && form.salePrice !== product.sellingPrice && (
              <button
                type="button"
                onClick={() => set('salePrice', product.sellingPrice)}
                className="ml-1.5 text-[10px] text-[#f97316] hover:underline"
              >
                reset
              </button>
            )}
          </label>
          <input
            type="number" min={0.01} step={0.01} value={form.salePrice}
            onChange={(e) => set('salePrice', Number(e.target.value))}
            className={fieldCls}
          />
          {errors.salePrice && <p className="text-xs text-red-500 mt-1">{errors.salePrice}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Date */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Date Sold</label>
          <input
            type="date" value={form.soldAt}
            onChange={(e) => set('soldAt', e.target.value)}
            className={fieldCls}
          />
          {errors.soldAt && <p className="text-xs text-red-500 mt-1">{errors.soldAt}</p>}
        </div>

        {/* Platform */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Platform</label>
          <select
            value={form.platform}
            onChange={(e) => set('platform', e.target.value)}
            className={fieldCls}
          >
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Live summary */}
      {product && form.salePrice > 0 && (
        <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
          <div className="flex justify-between text-slate-500">
            <span>Unit cost</span><span>{fmtC(cost)}</span>
          </div>
          <div className="border-t border-slate-200 pt-1 flex justify-between font-semibold text-slate-700">
            <span>Total revenue</span><span>{fmtC(totalRevenue)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total profit</span>
            <span className={totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}>
              {fmtC(totalProfit)}
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose}
          className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          Cancel
        </button>
        <button type="submit"
          className="flex-1 py-2.5 rounded-lg bg-[#f97316] text-white text-sm font-medium hover:bg-[#ea6d0f] transition-colors">
          Save Sale
        </button>
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Sales() {
  const sales = useSalesStore((s) => s.sales);
  const { addSale, updateSale, deleteSale } = useSalesStore();
  const products = useProductStore((s) => s.products);
  const spools = useFilamentStore((s) => s.spools);

  const [modal, setModal] = useState<'add' | { sale: SaleEntry } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterMonth, setFilterMonth] = useState('');

  // All months that have at least one sale, for the filter dropdown
  const months = useMemo(() => {
    const keys = [...new Set(sales.map((s) => monthKey(s.soldAt)))].sort().reverse();
    return keys;
  }, [sales]);

  // Platforms seen in sales
  const platforms = useMemo(() =>
    [...new Set(sales.map((s) => s.platform))].sort(), [sales]);

  // Filtered + sorted (newest first)
  const filtered = useMemo(() => {
    return [...sales]
      .filter((s) => {
        if (filterPlatform && s.platform !== filterPlatform) return false;
        if (filterMonth && monthKey(s.soldAt) !== filterMonth) return false;
        return true;
      })
      .sort((a, b) => b.soldAt.localeCompare(a.soldAt));
  }, [sales, filterPlatform, filterMonth]);

  // Group filtered sales by month
  const grouped = useMemo(() => {
    const map = new Map<string, SaleEntry[]>();
    for (const s of filtered) {
      const k = monthKey(s.soldAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return [...map.entries()];
  }, [filtered]);

  function handleSave(data: FormData) {
    if (modal === 'add') {
      addSale(data);
    } else if (modal && typeof modal === 'object') {
      updateSale((modal as { sale: SaleEntry }).sale.id, data);
    }
    setModal(null);
  }

  function handleExport() {
    exportToCsv('sales-log.csv', sales.map((s) => {
      const p = products.find((pr) => pr.id === s.productId);
      return {
        id: s.id,
        date: s.soldAt,
        productSku: p?.sku ?? '',
        productName: p?.name ?? '',
        platform: s.platform,
        quantity: s.quantity,
        salePrice: s.salePrice,
        totalRevenue: s.salePrice * s.quantity,
        unitCost: p ? unitCost(p, spools).toFixed(4) : '',
        totalProfit: p ? ((s.salePrice - unitCost(p, spools)) * s.quantity).toFixed(2) : '',
      };
    }));
  }

  // Summary stats
  const totalRevenue = sales.reduce((sum, s) => sum + s.salePrice * s.quantity, 0);
  const thisMonthKey = today().slice(0, 7);
  const thisMonthRevenue = sales
    .filter((s) => monthKey(s.soldAt) === thisMonthKey)
    .reduce((sum, s) => sum + s.salePrice * s.quantity, 0);
  const totalUnits = sales.reduce((sum, s) => sum + s.quantity, 0);

  // Top platform by revenue
  const platformRevenue = sales.reduce<Record<string, number>>((acc, s) => {
    acc[s.platform] = (acc[s.platform] ?? 0) + s.salePrice * s.quantity;
    return acc;
  }, {});
  const topPlatform = Object.entries(platformRevenue).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="hidden lg:block text-xl font-bold text-[#1e2a3a]">Sales Log</h1>
          <p className="text-xs text-slate-400 lg:mt-0.5">{sales.length} sale{sales.length !== 1 ? 's' : ''} recorded</p>
        </div>
        <button
          onClick={() => setModal('add')}
          className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
        >
          + Log Sale
        </button>
      </div>

      {/* Summary cards */}
      {sales.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-400 mb-0.5">All-time Revenue</p>
            <p className="text-lg font-bold text-[#1e2a3a]">{fmtC(totalRevenue)}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-400 mb-0.5">This Month</p>
            <p className="text-lg font-bold text-[#f97316]">{fmtC(thisMonthRevenue)}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-400 mb-0.5">Units Sold</p>
            <p className="text-lg font-bold text-[#1e2a3a]">{totalUnits}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-400 mb-0.5">Top Platform</p>
            <p className="text-lg font-bold text-[#1e2a3a] truncate">{topPlatform?.[0] ?? '—'}</p>
            {topPlatform && <p className="text-[10px] text-slate-400">{fmtC(topPlatform[1])}</p>}
          </div>
        </div>
      )}

      {/* Filters + export */}
      {sales.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {platforms.length > 1 && (
            <select
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#f97316]"
            >
              <option value="">All platforms</option>
              {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {months.length > 1 && (
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#f97316]"
            >
              <option value="">All months</option>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          )}
          <button
            onClick={handleExport}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors ml-auto"
          >
            ↓ Export CSV
          </button>
        </div>
      )}

      {/* Empty state */}
      {sales.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-100">
          <div className="text-4xl mb-3">💰</div>
          <p className="text-sm font-medium text-slate-600 mb-1">No sales yet</p>
          <p className="text-xs text-slate-400 mb-4">Log your first sale to start tracking revenue.</p>
          <button
            onClick={() => setModal('add')}
            className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
          >
            + Log Sale
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">No sales match your filters.</div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([month, monthSales]) => {
            const monthRevenue = monthSales.reduce((s, e) => s + e.salePrice * e.quantity, 0);
            const monthProfit = monthSales.reduce((s, e) => {
              const p = products.find((pr) => pr.id === e.productId);
              return s + (p ? (e.salePrice - unitCost(p, spools)) * e.quantity : 0);
            }, 0);

            return (
              <div key={month}>
                {/* Month header */}
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    {monthLabel(month)}
                  </p>
                  <div className="flex-1 h-px bg-slate-100" />
                  <p className="text-xs text-slate-400 whitespace-nowrap">
                    {fmtC(monthRevenue)} rev
                    <span className={`ml-2 font-medium ${monthProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {fmtC(monthProfit)} profit
                    </span>
                  </p>
                </div>

                {/* Table */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[620px]">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          {['Date', 'Product', 'Platform', 'Qty', 'Unit Price', 'Total', 'Profit', ''].map((h) => (
                            <th key={h} className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {monthSales.map((sale) => {
                          const product = products.find((p) => p.id === sale.productId);
                          const cost = product ? unitCost(product, spools) : 0;
                          const total = sale.salePrice * sale.quantity;
                          const profit = (sale.salePrice - cost) * sale.quantity;
                          return (
                            <tr key={sale.id}
                              className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                                {fmtDate(sale.soldAt)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {product ? (
                                  <>
                                    <p className="font-medium text-slate-800 text-xs">{product.name}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">{product.sku}</p>
                                  </>
                                ) : (
                                  <span className="text-slate-300 text-xs">Deleted product</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-block bg-[#1e2a3a]/8 text-[#1e2a3a] text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                                  {sale.platform}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-600 text-center">
                                {sale.quantity}
                              </td>
                              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                                {fmtC(sale.salePrice)}
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">
                                {fmtC(total)}
                              </td>
                              <td className={`px-4 py-3 font-semibold whitespace-nowrap ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {fmtC(profit)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setModal({ sale })}
                                    className="text-xs text-[#f97316] hover:underline"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => setDeleteId(sale.id)}
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
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {modal !== null && (
        <Modal
          title={modal === 'add' ? 'Log Sale' : 'Edit Sale'}
          onClose={() => setModal(null)}
        >
          <SaleForm
            initial={
              modal === 'add'
                ? emptyForm()
                : {
                    productId: (modal as { sale: SaleEntry }).sale.productId,
                    quantity: (modal as { sale: SaleEntry }).sale.quantity,
                    salePrice: (modal as { sale: SaleEntry }).sale.salePrice,
                    soldAt: (modal as { sale: SaleEntry }).sale.soldAt,
                    platform: (modal as { sale: SaleEntry }).sale.platform,
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
          message="Delete this sale entry? This cannot be undone."
          onConfirm={() => { deleteSale(deleteId); setDeleteId(null); }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
