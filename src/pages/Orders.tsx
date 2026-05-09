import { useState, useMemo } from 'react';
import { useOrderStore } from '../stores/orderStore';
import { useProductStore } from '../stores/productStore';
import { useFilamentStore } from '../stores/filamentStore';
import type { Order, OrderItem, OrderStatus } from '../types';
import type { FilamentSpool, Product } from '../types';
import { unitCost } from '../lib/metrics';
import { exportToCsv } from '../lib/csv';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';

const PLATFORMS = ['Etsy', 'Local / Market', 'eBay', 'Amazon', 'Shopify', 'Facebook', 'Other'];

const PLATFORM_FEES: Record<string, number> = {
  'Etsy': 6.5,
  'eBay': 13.25,
  'Amazon': 15,
  'Shopify': 2.9,
  'Local / Market': 0,
  'Facebook': 5,
  'Other': 0,
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'New',
  printing: 'Printing',
  printed: 'Printed',
  shipped: 'Shipped',
};

const STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  new: 'printing',
  printing: 'printed',
  printed: 'shipped',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  new: 'bg-blue-50 text-blue-700',
  printing: 'bg-orange-50 text-[#f97316]',
  printed: 'bg-purple-50 text-purple-700',
  shipped: 'bg-emerald-50 text-emerald-700',
};

const fmtC = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

const today = () => new Date().toISOString().slice(0, 10);

const fieldCls =
  'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent transition';

// ── Financials helper ─────────────────────────────────────────────────────────

function calcFinancials(
  items: OrderItem[],
  products: Product[],
  spools: FilamentSpool[],
  platformFeePercent: number,
  shippingCost: number,
) {
  let revenue = 0;
  let productCost = 0;
  for (const item of items) {
    const p = products.find((pr) => pr.id === item.productId);
    revenue += item.unitPrice * item.quantity;
    productCost += p ? unitCost(p, spools) * item.quantity : 0;
  }
  const platformFee = revenue * (platformFeePercent / 100);
  const netProfit = revenue - productCost - platformFee - shippingCost;
  const marginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  return { revenue, productCost, platformFee, netProfit, marginPct };
}

// ── Form ─────────────────────────────────────────────────────────────────────

type FormData = Omit<Order, 'id'>;

function emptyForm(orderCount: number): FormData {
  return {
    orderNumber: `ORD-${String(orderCount + 1).padStart(4, '0')}`,
    platform: 'Etsy',
    customerName: '',
    status: 'new',
    items: [{ productId: '', quantity: 1, unitPrice: 0 }],
    shippingCost: 0,
    platformFeePercent: PLATFORM_FEES['Etsy'],
    notes: '',
    createdAt: today(),
  };
}

function orderToFormData(order: Order): FormData {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...rest } = order;
  return rest;
}

function validate(f: FormData): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.orderNumber.trim()) e.orderNumber = 'Required';
  if (f.items.length === 0) {
    e.items = 'Add at least one item';
  } else {
    for (let i = 0; i < f.items.length; i++) {
      if (!f.items[i].productId) { e.items = `Item ${i + 1}: select a product`; break; }
      if (f.items[i].quantity < 1) { e.items = `Item ${i + 1}: qty must be ≥ 1`; break; }
    }
  }
  return e;
}

interface OrderFormProps {
  initial: FormData;
  onSave: (data: FormData) => void;
  onClose: () => void;
}

function OrderForm({ initial, onSave, onClose }: OrderFormProps) {
  const products = useProductStore((s) => s.products);
  const spools = useFilamentStore((s) => s.spools);
  const [form, setForm] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function handlePlatformChange(platform: string) {
    setForm((f) => ({ ...f, platform, platformFeePercent: PLATFORM_FEES[platform] ?? 0 }));
  }

  function handleItemChange(idx: number, field: keyof OrderItem, raw: string | number) {
    setForm((f) => {
      const items = [...f.items];
      if (field === 'productId') {
        const p = products.find((pr) => pr.id === raw);
        items[idx] = { ...items[idx], productId: raw as string, unitPrice: p ? p.sellingPrice : items[idx].unitPrice };
      } else {
        items[idx] = { ...items[idx], [field]: raw };
      }
      return { ...f, items };
    });
  }

  function addItem() {
    setForm((f) => ({ ...f, items: [...f.items, { productId: '', quantity: 1, unitPrice: 0 }] }));
  }

  function removeItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  const fin = useMemo(
    () => calcFinancials(form.items, products, spools, form.platformFeePercent, form.shippingCost),
    [form.items, form.platformFeePercent, form.shippingCost, products, spools],
  );

  const hasAnyPrice = form.items.some((i) => i.productId && i.unitPrice > 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Order # + Platform */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Order #</label>
          <input
            type="text"
            value={form.orderNumber}
            onChange={(e) => set('orderNumber', e.target.value)}
            className={fieldCls}
            placeholder="ORD-0001"
          />
          {errors.orderNumber && <p className="text-xs text-red-500 mt-1">{errors.orderNumber}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Platform</label>
          <select value={form.platform} onChange={(e) => handlePlatformChange(e.target.value)} className={fieldCls}>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Customer + Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Customer Name</label>
          <input
            type="text"
            value={form.customerName}
            onChange={(e) => set('customerName', e.target.value)}
            className={fieldCls}
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Order Date</label>
          <input
            type="date"
            value={form.createdAt}
            onChange={(e) => set('createdAt', e.target.value)}
            className={fieldCls}
          />
        </div>
      </div>

      {/* Status */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
        <select
          value={form.status}
          onChange={(e) => set('status', e.target.value as OrderStatus)}
          className={fieldCls}
        >
          {(['new', 'printing', 'printed', 'shipped'] as OrderStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-slate-600">Items</label>
          <button type="button" onClick={addItem} className="text-xs text-[#f97316] hover:underline font-medium">
            + Add Item
          </button>
        </div>
        <div className="space-y-2">
          {form.items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <div className="flex-1 min-w-0">
                <select
                  value={item.productId}
                  onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                  className={fieldCls}
                >
                  <option value="">— Product —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                  ))}
                </select>
              </div>
              <div className="w-14 shrink-0">
                <input
                  type="number" min={1} step={1}
                  value={item.quantity}
                  onChange={(e) => handleItemChange(idx, 'quantity', Math.max(1, Math.round(Number(e.target.value))))}
                  className={fieldCls}
                  placeholder="Qty"
                />
              </div>
              <div className="w-24 shrink-0">
                <input
                  type="number" min={0} step={0.01}
                  value={item.unitPrice}
                  onChange={(e) => handleItemChange(idx, 'unitPrice', Number(e.target.value))}
                  className={fieldCls}
                  placeholder="$0.00"
                />
              </div>
              {form.items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="text-slate-300 hover:text-red-400 transition-colors text-lg leading-none shrink-0"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {products.length === 0 && (
          <p className="text-[10px] text-slate-400 mt-1">Add products in the Product Catalog first.</p>
        )}
        {errors.items && <p className="text-xs text-red-500 mt-1">{errors.items}</p>}
      </div>

      {/* Shipping + Platform fee */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Shipping Cost ($)</label>
          <input
            type="number" min={0} step={0.01}
            value={form.shippingCost}
            onChange={(e) => set('shippingCost', Number(e.target.value))}
            className={fieldCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Platform Fee (%)</label>
          <input
            type="number" min={0} step={0.01}
            value={form.platformFeePercent}
            onChange={(e) => set('platformFeePercent', Number(e.target.value))}
            className={fieldCls}
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
          className={`${fieldCls} resize-none`}
          placeholder="Optional notes..."
        />
      </div>

      {/* Live profit summary */}
      {hasAnyPrice && (
        <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
          <div className="flex justify-between text-slate-500">
            <span>Revenue</span><span>{fmtC(fin.revenue)}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Product cost</span><span>−{fmtC(fin.productCost)}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Platform fee ({form.platformFeePercent}%)</span><span>−{fmtC(fin.platformFee)}</span>
          </div>
          {form.shippingCost > 0 && (
            <div className="flex justify-between text-slate-500">
              <span>Shipping</span><span>−{fmtC(form.shippingCost)}</span>
            </div>
          )}
          <div className="border-t border-slate-200 pt-1 flex justify-between font-semibold">
            <span>Net Profit</span>
            <span className={fin.netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}>
              {fmtC(fin.netProfit)}
              {fin.revenue > 0 && (
                <span className="ml-1 text-[10px] font-normal opacity-70">
                  ({fin.marginPct.toFixed(1)}%)
                </span>
              )}
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
          Save Order
        </button>
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | OrderStatus;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'printing', label: 'Printing' },
  { key: 'printed', label: 'Printed' },
  { key: 'shipped', label: 'Shipped' },
];

export default function Orders() {
  const orders = useOrderStore((s) => s.orders);
  const { addOrder, updateOrder, deleteOrder } = useOrderStore();
  const products = useProductStore((s) => s.products);
  const spools = useFilamentStore((s) => s.spools);

  const [modal, setModal] = useState<'add' | { order: Order } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(
    () =>
      [...orders]
        .filter((o) => statusFilter === 'all' || o.status === statusFilter)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders, statusFilter],
  );

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: orders.length, new: 0, printing: 0, printed: 0, shipped: 0 };
    for (const o of orders) c[o.status]++;
    return c;
  }, [orders]);

  const thisMonth = today().slice(0, 7);
  const monthOrders = useMemo(
    () => orders.filter((o) => o.createdAt.slice(0, 7) === thisMonth),
    [orders, thisMonth],
  );

  const { monthRevenue, monthProfit } = useMemo(() => {
    let rev = 0;
    let profit = 0;
    for (const o of monthOrders) {
      const f = calcFinancials(o.items, products, spools, o.platformFeePercent, o.shippingCost);
      rev += f.revenue;
      profit += f.netProfit;
    }
    return { monthRevenue: rev, monthProfit: profit };
  }, [monthOrders, products, spools]);

  const openCount = orders.filter((o) => o.status !== 'shipped').length;
  const readyCount = orders.filter((o) => o.status === 'printed').length;

  function handleSave(data: FormData) {
    if (modal === 'add') {
      addOrder(data);
    } else if (modal && typeof modal === 'object') {
      updateOrder((modal as { order: Order }).order.id, data);
    }
    setModal(null);
  }

  function advanceStatus(order: Order) {
    const next = STATUS_NEXT[order.status];
    if (next) updateOrder(order.id, { status: next });
  }

  function handleExport() {
    exportToCsv(
      'orders.csv',
      orders.map((o) => {
        const f = calcFinancials(o.items, products, spools, o.platformFeePercent, o.shippingCost);
        return {
          orderNumber: o.orderNumber,
          date: o.createdAt,
          customer: o.customerName,
          platform: o.platform,
          status: o.status,
          itemCount: o.items.length,
          revenue: f.revenue.toFixed(2),
          productCost: f.productCost.toFixed(2),
          platformFee: f.platformFee.toFixed(2),
          shippingCost: o.shippingCost.toFixed(2),
          netProfit: f.netProfit.toFixed(2),
          marginPct: f.marginPct.toFixed(1),
          notes: o.notes,
        };
      }),
    );
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="hidden lg:block text-xl font-bold text-[#1e2a3a]">Orders</h1>
          <p className="text-xs text-slate-400 lg:mt-0.5">
            {orders.length} order{orders.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {orders.length > 0 && (
            <button
              onClick={handleExport}
              className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              ↓ CSV
            </button>
          )}
          <button
            onClick={() => setModal('add')}
            className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
          >
            + New Order
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {orders.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-400 mb-0.5">Open Orders</p>
            <p className="text-lg font-bold text-[#1e2a3a]">{openCount}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-400 mb-0.5">Ready to Ship</p>
            <p className="text-lg font-bold text-purple-600">{readyCount}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-400 mb-0.5">This Month Revenue</p>
            <p className="text-lg font-bold text-[#f97316]">{fmtC(monthRevenue)}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-400 mb-0.5">This Month Profit</p>
            <p className={`text-lg font-bold ${monthProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {fmtC(monthProfit)}
            </p>
          </div>
        </div>
      )}

      {/* Status filter tabs */}
      {orders.length > 0 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          {STATUS_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
                statusFilter === key
                  ? 'bg-[#1e2a3a] text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
              ].join(' ')}
            >
              {label}
              <span
                className={[
                  'inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold',
                  statusFilter === key ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500',
                ].join(' ')}
              >
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-100">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-sm font-medium text-slate-600 mb-1">No orders yet</p>
          <p className="text-xs text-slate-400 mb-4">Create your first order to start tracking fulfillment.</p>
          <button
            onClick={() => setModal('add')}
            className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
          >
            + New Order
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">No orders with this status.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => {
            const fin = calcFinancials(order.items, products, spools, order.platformFeePercent, order.shippingCost);
            const nextStatus = STATUS_NEXT[order.status];
            const itemSummary = order.items
              .map((item) => {
                const p = products.find((pr) => pr.id === item.productId);
                return p ? `${item.quantity}× ${p.name}` : `${item.quantity}× (deleted)`;
              })
              .join(', ');

            return (
              <div key={order.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                {/* Top row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-[#1e2a3a]">#{order.orderNumber}</span>
                      <span className="text-xs bg-[#1e2a3a]/8 text-[#1e2a3a] px-2 py-0.5 rounded-full">
                        {order.platform}
                      </span>
                      {order.customerName && (
                        <span className="text-xs text-slate-500">{order.customerName}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(order.createdAt)}</p>
                  </div>
                  <span
                    className={`inline-block shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status]}`}
                  >
                    {STATUS_LABELS[order.status]}
                  </span>
                </div>

                {/* Items summary */}
                <p className="text-xs text-slate-500 mb-3 truncate">{itemSummary}</p>

                {/* Bottom row */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3 text-xs">
                    <div>
                      <span className="text-slate-400">Rev </span>
                      <span className="font-semibold text-slate-700">{fmtC(fin.revenue)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Profit </span>
                      <span className={`font-semibold ${fin.netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {fmtC(fin.netProfit)}
                      </span>
                    </div>
                    {fin.revenue > 0 && (
                      <span className="hidden sm:inline text-slate-400">
                        {fin.marginPct.toFixed(1)}% margin
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {nextStatus && (
                      <button
                        onClick={() => advanceStatus(order)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-[#f97316]/10 text-[#f97316] hover:bg-[#f97316]/20 font-medium transition-colors whitespace-nowrap"
                      >
                        → {STATUS_LABELS[nextStatus]}
                      </button>
                    )}
                    <button
                      onClick={() => setModal({ order })}
                      className="text-xs text-[#f97316] hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteId(order.id)}
                      className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Notes */}
                {order.notes && (
                  <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-50 pt-2 italic">
                    {order.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {modal !== null && (
        <Modal
          title={
            modal === 'add'
              ? 'New Order'
              : `Edit Order #${(modal as { order: Order }).order.orderNumber}`
          }
          onClose={() => setModal(null)}
        >
          <OrderForm
            initial={modal === 'add' ? emptyForm(orders.length) : orderToFormData((modal as { order: Order }).order)}
            onSave={handleSave}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <ConfirmDialog
          message="Delete this order? This cannot be undone."
          onConfirm={() => { deleteOrder(deleteId); setDeleteId(null); }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
