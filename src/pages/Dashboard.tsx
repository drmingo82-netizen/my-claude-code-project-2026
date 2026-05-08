import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useFilamentStore } from '../stores/filamentStore';
import { useProductStore } from '../stores/productStore';
import { useSalesStore } from '../stores/salesStore';
import { computeKPIs, monthlyRevenueChart, topProducts } from '../lib/metrics';
import { demoSpools, demoProducts, demoSales } from '../lib/demoData';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const pct = (n: number) => `${n.toFixed(1)}%`;

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}

function KpiCard({ label, value, sub, accent }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p
        className={`text-2xl font-bold leading-none ${
          accent ? 'text-[#f97316]' : 'text-[#1e2a3a]'
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const spools = useFilamentStore((s) => s.spools);
  const importSpools = useFilamentStore((s) => s.importSpools);
  const products = useProductStore((s) => s.products);
  const importProducts = useProductStore((s) => s.importProducts);
  const sales = useSalesStore((s) => s.sales);
  const hasData = sales.length > 0 || products.length > 0;

  function loadDemo() {
    importSpools(demoSpools);
    importProducts(demoProducts);
    useSalesStore.setState({ sales: demoSales });
  }

  function clearDemo() {
    importSpools([]);
    importProducts([]);
    useSalesStore.setState({ sales: [] });
  }

  const kpis = computeKPIs(sales, products, spools);
  const chartData = monthlyRevenueChart(sales, products, spools, 6);
  const topProds = topProducts(sales, products, spools, 5);

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#1e2a3a]">Dashboard</h1>
          <p className="text-xs text-slate-400 mt-0.5">Tactile Creations overview</p>
        </div>
        {!hasData ? (
          <button
            onClick={loadDemo}
            className="text-xs bg-[#1e2a3a] text-white px-3 py-1.5 rounded-lg hover:bg-[#2a3a4f] transition-colors"
          >
            Load demo data
          </button>
        ) : (
          <button
            onClick={clearDemo}
            className="text-xs text-slate-400 hover:text-red-500 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            Clear data
          </button>
        )}
      </div>

      {!hasData ? (
        <EmptyState onLoad={loadDemo} />
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <KpiCard label="Total Revenue" value={fmt(kpis.totalRevenue)} sub="all time" />
            <KpiCard
              label="Net Profit"
              value={fmt(kpis.netProfit)}
              sub="after costs"
              accent={kpis.netProfit > 0}
            />
            <KpiCard
              label="Avg Margin"
              value={pct(kpis.avgMarginPct)}
              sub="revenue basis"
            />
            <KpiCard
              label="Units Sold"
              value={kpis.totalOrders.toString()}
              sub={`${products.length} active SKUs`}
            />
          </div>

          {/* Chart + Top Products */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
            {/* Revenue chart */}
            <div className="lg:col-span-3 bg-white rounded-xl p-4 shadow-sm border border-slate-100">
              <p className="text-sm font-semibold text-[#1e2a3a] mb-3">
                Revenue & Profit — Last 6 Months
              </p>
              <div className="w-full h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={2} barSize={14}>
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${v}`}
                      width={42}
                    />
                    <Tooltip
                      formatter={(v) => typeof v === 'number' ? fmt(v) : v}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    <Bar dataKey="revenue" name="Revenue" fill="#1e2a3a" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="profit" name="Profit" fill="#f97316" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top products */}
            <div className="lg:col-span-2 bg-white rounded-xl p-4 shadow-sm border border-slate-100">
              <p className="text-sm font-semibold text-[#1e2a3a] mb-3">Top Products</p>
              {topProds.length === 0 ? (
                <p className="text-xs text-slate-400">No sales yet.</p>
              ) : (
                <div className="space-y-3">
                  {topProds.map((p, i) => (
                    <div key={p.sku} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-300 w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {p.units} units · {pct(p.marginPct)} margin
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-[#1e2a3a] shrink-0">
                        {fmt(p.revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Low filament alerts */}
          {kpis.lowSpools.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-orange-700 mb-2">
                ⚠️ Low Filament ({kpis.lowSpools.length} spool{kpis.lowSpools.length > 1 ? 's' : ''})
              </p>
              <div className="flex flex-wrap gap-2">
                {kpis.lowSpools.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white border border-orange-200 rounded-lg px-3 py-1.5 text-xs"
                  >
                    <span className="font-medium text-slate-700">
                      {s.brand} {s.material} {s.color}
                    </span>
                    <span className="text-orange-600 ml-1.5">
                      {s.weightRemainingG}g left (
                      {Math.round((s.weightRemainingG / s.weightTotalG) * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inventory value footer */}
          <div className="mt-4 flex justify-end">
            <p className="text-xs text-slate-400">
              Filament inventory value:{' '}
              <span className="font-semibold text-slate-600">{fmt(kpis.filamentValue)}</span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({ onLoad }: { onLoad: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-5xl mb-4">🖨️</div>
      <h2 className="text-lg font-semibold text-slate-700 mb-1">No data yet</h2>
      <p className="text-sm text-slate-400 mb-6 max-w-xs">
        Add filament, products, and sales to see your business metrics here.
      </p>
      <button
        onClick={onLoad}
        className="bg-[#f97316] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-[#ea6d0f] transition-colors"
      >
        Load demo data
      </button>
    </div>
  );
}
