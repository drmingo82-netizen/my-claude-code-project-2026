import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useFilamentStore } from '../stores/filamentStore';
import { useProductStore } from '../stores/productStore';
import { useLocationStore } from '../stores/locationStore';
import { useSalesStore } from '../stores/salesStore';
import { filamentCostPerG } from '../lib/metrics';
import type { FilamentSpool, Product } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt2 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function marginColor(pct: number) {
  if (pct >= 40) return 'text-emerald-600';
  if (pct >= 20) return 'text-amber-500';
  return 'text-red-500';
}

function marginBg(pct: number) {
  if (pct >= 40) return 'bg-emerald-500';
  if (pct >= 20) return 'bg-amber-400';
  return 'bg-red-400';
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed top-6 inset-x-4 z-50 bg-emerald-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg text-center">
      {message}
    </div>
  );
}

// ── Log Usage Modal ───────────────────────────────────────────────────────────

function LogUsageModal({
  spool,
  onClose,
  onSaved,
}: {
  spool: FilamentSpool;
  onClose: () => void;
  onSaved: (newRemaining: number) => void;
}) {
  const updateSpool = useFilamentStore((s) => s.updateSpool);
  const [grams, setGrams] = useState<number>(0);

  const newRemaining = Math.max(0, spool.weightRemainingG - grams);
  const pctAfter = spool.weightTotalG > 0 ? (newRemaining / spool.weightTotalG) * 100 : 0;
  const isLow = pctAfter < 20;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (grams <= 0) return;
    updateSpool(spool.id, { weightRemainingG: newRemaining });
    onSaved(newRemaining);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-2xl p-5 pb-safe-or-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-[#1e2a3a]">Log Usage</p>
          <button onClick={onClose} className="text-slate-400 text-xl p-1">×</button>
        </div>
        <p className="text-xs text-slate-500">
          {spool.brand} {spool.material} {spool.color} — {spool.weightRemainingG}g remaining
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Grams used</label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={grams || ''}
              onChange={(e) => setGrams(Number(e.target.value))}
              placeholder="Enter grams used"
              className="w-full text-[16px] sm:text-sm border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f97316]"
              autoFocus
            />
          </div>
          {grams > 0 && (
            <div className="bg-slate-50 rounded-xl p-3 space-y-2 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Currently remaining</span>
                <span>{spool.weightRemainingG}g</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Deducting</span>
                <span className="text-red-500">− {grams}g</span>
              </div>
              <div className="flex justify-between font-semibold text-slate-700 border-t border-slate-200 pt-1.5">
                <span>New remaining</span>
                <span className={isLow ? 'text-red-500' : 'text-emerald-600'}>
                  {newRemaining}g {isLow && '⚠️'}
                </span>
              </div>
              <div className="mt-1">
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isLow ? 'bg-red-400' : 'bg-emerald-500'}`}
                    style={{ width: `${pctAfter}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          <button
            type="submit"
            disabled={grams <= 0}
            className="w-full py-4 rounded-xl bg-[#f97316] text-white font-semibold text-sm disabled:opacity-40"
          >
            Deduct Grams
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Log Sale Modal ────────────────────────────────────────────────────────────

const PLATFORMS = ['Etsy', 'Local', 'Facebook Marketplace', 'Instagram', 'Other'];

function LogSaleModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const addSale = useSalesStore((s) => s.addSale);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(product.sellingPrice);
  const [platform, setPlatform] = useState('Etsy');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (qty <= 0 || price < 0) return;
    addSale({
      productId: product.id,
      quantity: qty,
      salePrice: price,
      soldAt: new Date().toISOString(),
      platform,
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full rounded-t-2xl p-5 pb-safe-or-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-[#1e2a3a]">Log a Sale</p>
          <button onClick={onClose} className="text-slate-400 text-xl p-1">×</button>
        </div>
        <p className="text-xs text-slate-500">{product.sku} — {product.name}</p>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Quantity</label>
              <input
                type="number" min={1} value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="w-full text-[16px] sm:text-sm border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f97316]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Sale Price ($)</label>
              <input
                type="number" min={0} step={0.01} value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full text-[16px] sm:text-sm border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f97316]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full text-[16px] sm:text-sm border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f97316]"
            >
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <button
            type="submit"
            disabled={qty <= 0}
            className="w-full py-4 rounded-xl bg-[#f97316] text-white font-semibold text-sm disabled:opacity-40"
          >
            Log Sale
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Spool detail card ─────────────────────────────────────────────────────────

function SpoolCard({ spool, isNfc }: { spool: FilamentSpool; isNfc: boolean }) {
  const navigate = useNavigate();
  const locations = useLocationStore((s) => s.locations);
  const location = locations.find((l) => l.id === spool.locationId);
  const cpg = filamentCostPerG(spool);
  const pct = spool.weightTotalG > 0 ? (spool.weightRemainingG / spool.weightTotalG) * 100 : 0;
  const isLow = pct < 20;

  const [showLogUsage, setShowLogUsage] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [localRemaining, setLocalRemaining] = useState(spool.weightRemainingG);
  const localPct = spool.weightTotalG > 0 ? (localRemaining / spool.weightTotalG) * 100 : 0;

  const hex = spool.colorHex ?? '#94a3b8';

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col">
      {/* Back button */}
      <div className="px-4 pt-safe-or-4 pb-3 shrink-0">
        <button onClick={() => navigate(-1)} className="text-slate-500 text-sm flex items-center gap-1">
          ← Back
        </button>
      </div>

      {/* Card */}
      <div className="flex-1 px-4 pb-4 space-y-4">
        {/* Color swatch + identity */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-16 h-16 rounded-full shrink-0 border-2 border-white shadow-md"
              style={{ backgroundColor: hex }}
            >
              {spool.colorHex && (
                <div className="w-full h-full rounded-full" style={{ backgroundColor: hex }} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold text-[#1e2a3a] leading-tight truncate">{spool.brand}</p>
              <p className="text-lg font-semibold text-slate-700 leading-tight truncate">{spool.color}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="inline-block px-2.5 py-0.5 bg-[#f97316] text-white text-xs font-medium rounded-full">
                  {spool.material}
                </span>
                {isNfc && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2"/><path d="M12 8v4l3 3"/></svg>
                    NFC
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Remaining weight */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Remaining</span>
              <span className={`font-semibold ${isLow ? 'text-red-500' : 'text-[#1e2a3a]'}`}>
                {localRemaining}g / {spool.weightTotalG}g
              </span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${localPct < 20 ? 'bg-red-400' : localPct < 50 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                style={{ width: `${localPct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>{localPct.toFixed(0)}% full</span>
              {isLow && <span className="text-red-500 font-medium">⚠ Low</span>}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Cost per gram</span>
            <span className="font-semibold text-[#1e2a3a]">
              {cpg > 0 ? `$${cpg.toFixed(4)}/g` : '—'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Spool cost</span>
            <span className="font-semibold text-[#1e2a3a]">
              {spool.costPerSpool > 0 ? fmt2(spool.costPerSpool) : '—'}
            </span>
          </div>
          {location && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Storage</span>
              <span className="font-semibold text-[#1e2a3a]">{location.name}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Purchased</span>
            <span className="font-semibold text-[#1e2a3a]">
              {new Date(spool.purchasedAt).toLocaleDateString()}
            </span>
          </div>
          {spool.notes && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-500">{spool.notes}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3 pb-safe-or-6">
          <button
            onClick={() => setShowLogUsage(true)}
            className="w-full py-4 rounded-2xl bg-[#f97316] text-white font-semibold text-base shadow-sm active:scale-[0.98]"
          >
            Log Usage
          </button>
          <button
            onClick={() => navigate('/filament')}
            className="w-full py-4 rounded-2xl border-2 border-slate-200 text-slate-700 font-semibold text-base active:scale-[0.98]"
          >
            Open in Inventory
          </button>
          <button
            onClick={() => navigate('/calculator')}
            className="w-full py-4 rounded-2xl border-2 border-slate-200 text-slate-700 font-semibold text-base active:scale-[0.98]"
          >
            Send to Calculator
          </button>
        </div>
      </div>

      {/* Log Usage modal */}
      {showLogUsage && (
        <LogUsageModal
          spool={{ ...spool, weightRemainingG: localRemaining }}
          onClose={() => setShowLogUsage(false)}
          onSaved={(newRemaining) => {
            setLocalRemaining(newRemaining);
            setShowLogUsage(false);
            setToast(`Updated — ${newRemaining}g remaining`);
          }}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// ── Product detail card ───────────────────────────────────────────────────────

function ProductCard({ product }: { product: Product }) {
  const navigate = useNavigate();
  const spools = useFilamentStore((s) => s.spools);
  const [showLogSale, setShowLogSale] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const linkedSpool = spools.find((s) => s.id === product.filamentSpoolId);
  const cpg = linkedSpool ? filamentCostPerG(linkedSpool) : 0;
  const materialCost = cpg * product.filamentUsedG;
  const laborCost = product.laborHours * product.laborRatePerHour;
  const totalCost = materialCost + laborCost + product.otherCosts;
  const margin = product.sellingPrice > 0
    ? ((product.sellingPrice - totalCost) / product.sellingPrice) * 100
    : 0;

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col">
      {/* Back button */}
      <div className="px-4 pt-safe-or-4 pb-3 shrink-0">
        <button onClick={() => navigate(-1)} className="text-slate-500 text-sm flex items-center gap-1">
          ← Back
        </button>
      </div>

      <div className="flex-1 px-4 pb-4 space-y-4">
        {/* Identity */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <span className="inline-block px-2.5 py-0.5 bg-[#1e2a3a] text-white text-xs font-mono rounded mb-2">
                {product.sku}
              </span>
              <p className="text-xl font-bold text-[#1e2a3a] leading-tight">{product.name}</p>
              <p className="text-sm text-slate-500 mt-0.5">{product.category}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-[#1e2a3a]">{fmt2(product.sellingPrice)}</p>
              <p className="text-xs text-slate-400">selling price</p>
            </div>
          </div>

          {/* Margin indicator */}
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs text-slate-500">Margin</span>
              <span className={`text-sm font-bold ${marginColor(margin)}`}>
                {margin.toFixed(1)}%
              </span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${marginBg(margin)}`}
                style={{ width: `${Math.min(100, Math.max(0, margin))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Cost breakdown */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Cost Breakdown</p>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Filament ({product.filamentUsedG}g)</span>
            <span className="font-medium text-[#1e2a3a]">{fmt2(materialCost)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Labor ({product.laborHours}h)</span>
            <span className="font-medium text-[#1e2a3a]">{fmt2(laborCost)}</span>
          </div>
          {product.otherCosts > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Other</span>
              <span className="font-medium text-[#1e2a3a]">{fmt2(product.otherCosts)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-semibold border-t border-slate-100 pt-2">
            <span className="text-slate-600">Total Cost</span>
            <span className="text-[#1e2a3a]">{fmt2(totalCost)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Print time</span>
            <span className="font-medium text-[#1e2a3a]">{product.printTimeHours}h</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 pb-safe-or-6">
          <button
            onClick={() => setShowLogSale(true)}
            className="w-full py-4 rounded-2xl bg-[#f97316] text-white font-semibold text-base shadow-sm active:scale-[0.98]"
          >
            Log a Sale
          </button>
          <button
            onClick={() => navigate('/products')}
            className="w-full py-4 rounded-2xl border-2 border-slate-200 text-slate-700 font-semibold text-base active:scale-[0.98]"
          >
            Open in Catalog
          </button>
          <button
            onClick={() => navigate('/calculator')}
            className="w-full py-4 rounded-2xl border-2 border-slate-200 text-slate-700 font-semibold text-base active:scale-[0.98]"
          >
            Calculate Margin
          </button>
        </div>
      </div>

      {showLogSale && (
        <LogSaleModal
          product={product}
          onClose={() => setShowLogSale(false)}
          onSaved={() => {
            setShowLogSale(false);
            setToast('Sale logged!');
          }}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// ── Error states ──────────────────────────────────────────────────────────────

function ErrorCard({
  icon,
  title,
  message,
  buttonLabel,
  onButton,
}: {
  icon: string;
  title: string;
  message?: string;
  buttonLabel: string;
  onButton: () => void;
}) {
  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center p-8 text-center gap-5">
      <div className="w-20 h-20 rounded-2xl bg-orange-100 flex items-center justify-center text-4xl">
        {icon}
      </div>
      <div>
        <p className="text-lg font-bold text-[#1e2a3a] mb-1">{title}</p>
        {message && <p className="text-sm text-slate-500">{message}</p>}
      </div>
      <button
        onClick={onButton}
        className="px-8 py-4 rounded-2xl bg-[#f97316] text-white font-semibold text-sm"
      >
        {buttonLabel}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ScanLanding() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const spoolId = params.get('spoolId');
  const skuId = params.get('skuId');
  const type = params.get('type');
  const source = params.get('source');

  const spools = useFilamentStore((s) => s.spools);
  const products = useProductStore((s) => s.products);

  // Redirect if no params
  useEffect(() => {
    if (!spoolId && !skuId) {
      navigate('/', { replace: true });
    }
  }, [spoolId, skuId, navigate]);

  if (type === 'filament' || spoolId) {
    if (!spoolId) {
      return (
        <ErrorCard
          icon="⚠️"
          title="Unrecognized QR"
          message="This QR code doesn't contain a spool ID."
          buttonLabel="Scan Again"
          onButton={() => navigate(-1)}
        />
      );
    }
    const spool = spools.find((s) => s.id === spoolId);
    if (!spool) {
      return (
        <ErrorCard
          icon="🧵"
          title="Spool not found"
          message="This spool ID isn't in your inventory. It may have been deleted."
          buttonLabel="Go to Inventory"
          onButton={() => navigate('/filament')}
        />
      );
    }
    return <SpoolCard spool={spool} isNfc={source === 'nfc'} />;
  }

  if (type === 'product' || skuId) {
    if (!skuId) {
      return (
        <ErrorCard
          icon="⚠️"
          title="Unrecognized QR"
          message="This QR code doesn't contain a product ID."
          buttonLabel="Scan Again"
          onButton={() => navigate(-1)}
        />
      );
    }
    const product = products.find((p) => p.id === skuId);
    if (!product) {
      return (
        <ErrorCard
          icon="🖨️"
          title="Product not found"
          message="This product ID isn't in your catalog. It may have been deleted."
          buttonLabel="Go to Catalog"
          onButton={() => navigate('/products')}
        />
      );
    }
    return <ProductCard product={product} />;
  }

  return (
    <ErrorCard
      icon="❓"
      title="Unrecognized QR"
      message="This QR code format isn't recognized."
      buttonLabel="Scan Again"
      onButton={() => navigate(-1)}
    />
  );
}
