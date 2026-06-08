import { useState } from 'react';
import { useUsageHistoryStore } from '../../stores/usageHistoryStore';
import { filamentCostPerG } from '../../lib/metrics';
import type { FilamentSpool } from '../../types';

const PRINTER_LABELS: Record<string, string> = {
  p1s: 'P1S',
  h2s: 'H2S',
};

const fmt2 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export default function SpoolHistoryTab({ spool }: { spool: FilamentSpool }) {
  const records = useUsageHistoryStore((s) =>
    s.records.filter((r) => r.spoolId === spool.id),
  );
  const [showAll, setShowAll] = useState(false);

  const cpg = filamentCostPerG(spool);
  const totalGrams = records.reduce((sum, r) => sum + r.gramsUsed, 0);
  const totalCost = totalGrams * cpg;

  if (records.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-slate-400">No usage records yet.</p>
        <p className="text-xs text-slate-300 mt-1">
          Records are created automatically when a print completes.
        </p>
      </div>
    );
  }

  const visible = showAll ? records : records.slice(0, 10);

  return (
    <div>
      {/* Totals summary */}
      <div className="flex gap-5 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <div>
          <p className="text-[10px] text-slate-400 mb-0.5">Total Used</p>
          <p className="text-sm font-semibold text-[#1e2a3a]">{totalGrams.toFixed(1)}g</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 mb-0.5">Total Cost</p>
          <p className="text-sm font-semibold text-[#1e2a3a]">{fmt2(totalCost)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 mb-0.5">Print Jobs</p>
          <p className="text-sm font-semibold text-[#1e2a3a]">{records.length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[460px]">
          <thead>
            <tr className="border-b border-slate-100">
              {['Date', 'Job', 'Printer', 'Grams', 'Cost', 'Type'].map((h) => (
                <th
                  key={h}
                  className={`py-2 pr-3 font-semibold text-slate-400 ${
                    h === 'Grams' || h === 'Cost' ? 'text-right' : 'text-left'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const costUSD = r.gramsUsed * cpg;
              const date = new Date(r.completedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });
              const jobName = r.gcodeFile.split('/').pop() ?? r.gcodeFile;
              const printer = PRINTER_LABELS[r.printerId] ?? r.printerId.toUpperCase();

              return (
                <tr
                  key={r.id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors"
                >
                  <td className="py-2.5 pr-3 text-slate-400 whitespace-nowrap">{date}</td>
                  <td className="py-2.5 pr-3 text-slate-600 max-w-[110px] truncate">{jobName}</td>
                  <td className="py-2.5 pr-3 text-slate-500">{printer}</td>
                  <td className="py-2.5 pr-3 text-right text-slate-700 font-medium whitespace-nowrap">
                    {r.gramsUsed}g
                  </td>
                  <td className="py-2.5 pr-3 text-right text-slate-600 whitespace-nowrap">
                    {fmt2(costUSD)}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        r.deductionType === 'automatic'
                          ? 'bg-emerald-50 text-emerald-700'
                          : r.deductionType === 'partial'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {r.deductionType === 'partial' && r.completionPct !== undefined
                        ? `partial ${r.completionPct}%`
                        : r.deductionType}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {records.length > 10 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-xs text-[#f97316] hover:underline font-medium"
        >
          {showAll ? 'Show less' : `View all ${records.length} records →`}
        </button>
      )}
    </div>
  );
}
