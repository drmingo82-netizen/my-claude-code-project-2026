import { useState, useMemo } from 'react';
import { useProductStore } from '../stores/productStore';
import { useFilamentStore } from '../stores/filamentStore';
import { unitCost } from '../lib/metrics';
import type { Product, FilamentSpool } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtC = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function marginColor(pct: number): string {
  if (pct >= 40) return 'text-emerald-600';
  if (pct >= 20) return 'text-amber-500';
  return 'text-red-500';
}

function marginBg(pct: number): string {
  if (pct >= 40) return 'bg-emerald-500';
  if (pct >= 20) return 'bg-amber-400';
  return 'bg-red-400';
}

function marginLabel(pct: number): string {
  if (pct >= 50) return 'Excellent';
  if (pct >= 35) return 'Healthy';
  if (pct >= 20) return 'Acceptable';
  if (pct >= 0) return 'Thin';
  return 'Loss';
}

const PLATFORMS: { label: string; fee: number; note: string }[] = [
  { label: 'Local / Direct', fee: 0, note: '0% fees' },
  { label: 'Etsy', fee: 11.5, note: '~11.5% (txn + payment)' },
  { label: 'eBay', fee: 13.25, note: '13.25% final value' },
  { label: 'Amazon', fee: 15, note: '15% referral' },
  { label: 'Shopify', fee: 2.9, note: '2.9% payment' },
];

// ── Field component (inline, lighter than FormField) ─────────────────────────

interface FieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  prefix?: string;
  suffix?: string;
}

function Field({ label, value, onChange, step = 0.01, min = 0, prefix, suffix }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-[#f97316] focus-within:border-transparent">
        {prefix && (
          <span className="px-2.5 py-2 text-sm text-slate-400 bg-slate-50 border-r border-slate-200 select-none">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 text-sm px-3 py-2 focus:outline-none"
        />
        {suffix && (
          <span className="px-2.5 py-2 text-sm text-slate-400 bg-slate-50 border-l border-slate-200 select-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Results panel ─────────────────────────────────────────────────────────────

interface ResultsProps {
  totalCost: number;
  filamentCost: number;
  laborCost: number;
  otherCosts: number;
  sellingPrice: number;
  platformFeePct: number;
  monthlyOverhead: number;
  targetMarginPct: number;
  onTargetMarginChange: (v: number) => void;
}

function Results({
  totalCost,
  filamentCost,
  laborCost,
  otherCosts,
  sellingPrice,
  platformFeePct,
  monthlyOverhead,
  targetMarginPct,
  onTargetMarginChange,
}: ResultsProps) {
  const platformFeeAmt = sellingPrice * (platformFeePct / 100);
  const netRevenue = sellingPrice - platformFeeAmt;
  const profit = netRevenue - totalCost;
  const marginPct = netRevenue > 0 ? (profit / netRevenue) * 100 : 0;
  const gaugeWidth = Math.min(100, Math.max(0, marginPct));

  // Suggested price for target margin
  // netRevenue = price * (1 - fee%)
  // profit = netRevenue - cost >= targetMargin% * netRevenue
  // netRevenue * (1 - targetMargin%) = cost
  // price = cost / ((1 - targetMargin%) * (1 - fee%))
  const suggestedPrice =
    targetMarginPct < 100 && platformFeePct < 100
      ? totalCost / ((1 - targetMarginPct / 100) * (1 - platformFeePct / 100))
      : 0;

  // Break-even
  const breakEvenUnits = profit > 0 && monthlyOverhead > 0
    ? Math.ceil(monthlyOverhead / profit)
    : null;

  return (
    <div className="space-y-4">
      {/* Margin gauge */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-end justify-between mb-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Net Margin</p>
          <div className="text-right">
            <span className={`text-3xl font-bold ${marginColor(marginPct)}`}>
              {marginPct.toFixed(1)}%
            </span>
            <span className={`ml-2 text-xs font-semibold ${marginColor(marginPct)}`}>
              {marginLabel(marginPct)}
            </span>
          </div>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${marginBg(marginPct)}`}
            style={{ width: `${gaugeWidth}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-300 mt-1">
          <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Breakdown</p>
        <div className="space-y-2 text-sm">
          <Row label="Filament" value={fmtC(filamentCost)} muted />
          <Row label="Labor" value={fmtC(laborCost)} muted />
          <Row label="Other costs" value={fmtC(otherCosts)} muted />
          <div className="border-t border-slate-100 pt-2">
            <Row label="Total cost" value={fmtC(totalCost)} bold />
          </div>
          <Row label="Sell price" value={fmtC(sellingPrice)} muted />
          {platformFeePct > 0 && (
            <Row
              label={`Platform fee (${platformFeePct}%)`}
              value={`− ${fmtC(platformFeeAmt)}`}
              muted
              negative
            />
          )}
          <div className="border-t border-slate-100 pt-2">
            <Row label="Net revenue" value={fmtC(netRevenue)} bold />
            <Row
              label="Profit / unit"
              value={fmtC(profit)}
              bold
              accent={profit >= 0}
              negative={profit < 0}
            />
          </div>
        </div>
      </div>

      {/* Target margin → suggested price */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Price for Target Margin
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-[#f97316] flex-1">
            <input
              type="number"
              value={targetMarginPct}
              min={0}
              max={99}
              step={1}
              onChange={(e) => onTargetMarginChange(Number(e.target.value))}
              className="flex-1 text-sm px-3 py-2 focus:outline-none"
            />
            <span className="px-2.5 py-2 text-sm text-slate-400 bg-slate-50 border-l border-slate-200">%</span>
          </div>
          <span className="text-slate-400 text-sm">→</span>
          <div className="flex-1 bg-[#1e2a3a] text-white rounded-lg px-3 py-2 text-sm font-bold text-center">
            {suggestedPrice > 0 ? fmtC(suggestedPrice) : '—'}
          </div>
        </div>
        {suggestedPrice > 0 && sellingPrice > 0 && (
          <p className="text-[10px] text-slate-400 mt-2">
            {suggestedPrice > sellingPrice
              ? `↑ Raise price by ${fmtC(suggestedPrice - sellingPrice)} from current`
              : `↓ You can lower price by ${fmtC(sellingPrice - suggestedPrice)} from current`}
          </p>
        )}
      </div>

      {/* Break-even */}
      {monthlyOverhead > 0 && (
        <div className={`rounded-xl border shadow-sm p-4 ${breakEvenUnits !== null ? 'bg-white border-slate-100' : 'bg-amber-50 border-amber-200'}`}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Monthly Break-even
          </p>
          {breakEvenUnits !== null ? (
            <>
              <p className="text-2xl font-bold text-[#1e2a3a]">
                {breakEvenUnits} unit{breakEvenUnits !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                to cover {fmtC(monthlyOverhead)}/mo overhead at {fmtC(profit)}/unit profit
              </p>
            </>
          ) : (
            <p className="text-sm text-amber-600">
              {profit <= 0
                ? 'No break-even possible — unit is at a loss.'
                : 'Enter a selling price to calculate.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label, value, muted, bold, accent, negative,
}: {
  label: string; value: string; muted?: boolean; bold?: boolean; accent?: boolean; negative?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className={muted && !bold ? 'text-slate-500' : 'text-slate-700 font-medium'}>{label}</span>
      <span
        className={[
          bold ? 'font-semibold' : '',
          accent ? 'text-emerald-600' : '',
          negative ? 'text-red-500' : '',
          !accent && !negative ? 'text-slate-700' : '',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

// ── Custom tab ────────────────────────────────────────────────────────────────

interface CustomState {
  filamentCostPerG: number;
  filamentUsedG: number;
  laborHours: number;
  laborRatePerHour: number;
  otherCosts: number;
  sellingPrice: number;
}

function CustomTab({
  platformFeePct, monthlyOverhead, targetMarginPct, onTargetMarginChange,
}: {
  platformFeePct: number; monthlyOverhead: number;
  targetMarginPct: number; onTargetMarginChange: (v: number) => void;
}) {
  const [c, setC] = useState<CustomState>({
    filamentCostPerG: 0.02,
    filamentUsedG: 50,
    laborHours: 0.5,
    laborRatePerHour: 20,
    otherCosts: 1,
    sellingPrice: 15,
  });

  const s = <K extends keyof CustomState>(k: K, v: number) => setC((prev) => ({ ...prev, [k]: v }));

  const filamentCost = c.filamentCostPerG * c.filamentUsedG;
  const laborCost = c.laborHours * c.laborRatePerHour;
  const totalCost = filamentCost + laborCost + c.otherCosts;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-3">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filament</p>
          <Field label="Cost per gram ($)" value={c.filamentCostPerG} onChange={(v) => s('filamentCostPerG', v)} step={0.0001} />
          <Field label="Amount used (g)" value={c.filamentUsedG} onChange={(v) => s('filamentUsedG', v)} step={1} />
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Labor</p>
          <Field label="Hours" value={c.laborHours} onChange={(v) => s('laborHours', v)} step={0.25} />
          <Field label="Rate ($/hr)" value={c.laborRatePerHour} onChange={(v) => s('laborRatePerHour', v)} step={0.5} />
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pricing</p>
          <Field label="Other costs ($)" value={c.otherCosts} onChange={(v) => s('otherCosts', v)} />
          <Field label="Selling price ($)" value={c.sellingPrice} onChange={(v) => s('sellingPrice', v)} />
        </div>
      </div>
      <Results
        totalCost={totalCost}
        filamentCost={filamentCost}
        laborCost={laborCost}
        otherCosts={c.otherCosts}
        sellingPrice={c.sellingPrice}
        platformFeePct={platformFeePct}
        monthlyOverhead={monthlyOverhead}
        targetMarginPct={targetMarginPct}
        onTargetMarginChange={onTargetMarginChange}
      />
    </div>
  );
}

// ── Product Lookup tab ────────────────────────────────────────────────────────

function ProductTab({
  platformFeePct, monthlyOverhead, targetMarginPct, onTargetMarginChange,
}: {
  platformFeePct: number; monthlyOverhead: number;
  targetMarginPct: number; onTargetMarginChange: (v: number) => void;
}) {
  const products = useProductStore((s) => s.products);
  const spools = useFilamentStore((s) => s.spools);
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? '');
  const [overridePrice, setOverridePrice] = useState<number | null>(null);

  const product: Product | undefined = products.find((p) => p.id === selectedId);

  const { filamentCost, laborCost, totalCost, sellingPrice } = useMemo(() => {
    if (!product) return { filamentCost: 0, laborCost: 0, totalCost: 0, sellingPrice: 0 };
    const spool: FilamentSpool | undefined = spools.find((s) => s.id === product.filamentSpoolId);
    const fc = spool
      ? (spool.costPerSpool / spool.weightTotalG) * product.filamentUsedG
      : 0;
    const lc = product.laborHours * product.laborRatePerHour;
    const tc = unitCost(product, spools);
    return {
      filamentCost: fc,
      laborCost: lc,
      totalCost: tc,
      sellingPrice: overridePrice ?? product.sellingPrice,
    };
  }, [product, spools, overridePrice]);

  function handleProductChange(id: string) {
    setSelectedId(id);
    setOverridePrice(null);
  }

  if (products.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-400 text-sm">No products yet. Add SKUs in the Product Catalog first.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-3">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select Product</p>
          <select
            value={selectedId}
            onChange={(e) => handleProductChange(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316]"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>

          {product && (
            <div className="space-y-1 text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
              <div className="flex justify-between"><span>Category</span><span className="font-medium text-slate-700">{product.category}</span></div>
              <div className="flex justify-between"><span>Filament used</span><span className="font-medium text-slate-700">{product.filamentUsedG}g</span></div>
              <div className="flex justify-between"><span>Print time</span><span className="font-medium text-slate-700">{product.printTimeHours}h</span></div>
              <div className="flex justify-between"><span>Labor</span><span className="font-medium text-slate-700">{product.laborHours}h @ ${product.laborRatePerHour}/hr</span></div>
            </div>
          )}
        </div>

        {product && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              What-if Sell Price
            </p>
            <Field
              label={`Selling price (catalog: ${fmtC(product.sellingPrice)})`}
              value={overridePrice ?? product.sellingPrice}
              onChange={(v) => setOverridePrice(v)}
              prefix="$"
            />
            {overridePrice !== null && overridePrice !== product.sellingPrice && (
              <button
                onClick={() => setOverridePrice(null)}
                className="text-xs text-[#f97316] hover:underline"
              >
                Reset to catalog price
              </button>
            )}
          </div>
        )}
      </div>

      {product && (
        <Results
          totalCost={totalCost}
          filamentCost={filamentCost}
          laborCost={laborCost}
          otherCosts={product.otherCosts}
          sellingPrice={sellingPrice}
          platformFeePct={platformFeePct}
          monthlyOverhead={monthlyOverhead}
          targetMarginPct={targetMarginPct}
          onTargetMarginChange={onTargetMarginChange}
        />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'product' | 'custom';

export default function Calculator() {
  const [tab, setTab] = useState<Tab>('product');
  const [platformIdx, setPlatformIdx] = useState(0);
  const [customFeePct, setCustomFeePct] = useState(10);
  const [useCustomFee, setUseCustomFee] = useState(false);
  const [monthlyOverhead, setMonthlyOverhead] = useState(0);
  const [targetMarginPct, setTargetMarginPct] = useState(35);

  const platformFeePct = useCustomFee ? customFeePct : PLATFORMS[platformIdx].fee;

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="hidden lg:block text-xl font-bold text-[#1e2a3a]">Profit Calculator</h1>
        <p className="text-xs text-slate-400 lg:mt-0.5">Model pricing, margins, and break-even</p>
      </div>

      {/* Global options */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Platform / Sales Channel
          </p>
          <div className="flex overflow-x-auto gap-2 pb-1 -mb-1 scrollbar-none">
            {PLATFORMS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => { setPlatformIdx(i); setUseCustomFee(false); }}
                style={{ touchAction: 'manipulation' }}
                className={[
                  'text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap shrink-0',
                  !useCustomFee && platformIdx === i
                    ? 'bg-[#1e2a3a] text-white border-[#1e2a3a]'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                ].join(' ')}
                title={p.note}
              >
                {p.label}
                <span className="ml-1 text-[10px] opacity-60">{p.fee}%</span>
              </button>
            ))}
            <button
              onClick={() => setUseCustomFee(true)}
              className={[
                'text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5',
                useCustomFee
                  ? 'bg-[#1e2a3a] text-white border-[#1e2a3a]'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              Custom
              {useCustomFee && (
                <input
                  type="number"
                  value={customFeePct}
                  min={0}
                  max={99}
                  step={0.1}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setCustomFeePct(Number(e.target.value))}
                  className="w-12 bg-white/20 text-white text-xs rounded px-1 py-0.5 focus:outline-none text-center"
                />
              )}
              {useCustomFee && <span className="text-[10px] opacity-70">%</span>}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Monthly Overhead ($) <span className="text-slate-300 font-normal">— for break-even</span>
            </label>
            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-[#f97316]">
              <span className="px-2.5 py-2 text-sm text-slate-400 bg-slate-50 border-r border-slate-200">$</span>
              <input
                type="number"
                value={monthlyOverhead}
                min={0}
                step={10}
                onChange={(e) => setMonthlyOverhead(Number(e.target.value))}
                className="flex-1 text-sm px-3 py-2 focus:outline-none"
                placeholder="0"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4">
        {(['product', 'custom'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'flex-1 py-2 text-sm font-medium rounded-lg transition-colors capitalize',
              tab === t ? 'bg-white text-[#1e2a3a] shadow-sm' : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {t === 'product' ? 'Product Lookup' : 'Custom'}
          </button>
        ))}
      </div>

      {tab === 'product' ? (
        <ProductTab
          platformFeePct={platformFeePct}
          monthlyOverhead={monthlyOverhead}
          targetMarginPct={targetMarginPct}
          onTargetMarginChange={setTargetMarginPct}
        />
      ) : (
        <CustomTab
          platformFeePct={platformFeePct}
          monthlyOverhead={monthlyOverhead}
          targetMarginPct={targetMarginPct}
          onTargetMarginChange={setTargetMarginPct}
        />
      )}
    </div>
  );
}
