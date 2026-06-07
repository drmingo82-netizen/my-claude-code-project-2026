import { useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { QRCodeSVG } from 'qrcode.react';
import { useFilamentStore } from '../stores/filamentStore';
import { filamentCostPerG } from '../lib/metrics';
import { spoolQrUrl, buildPrintHtml } from '../utils/scanUtils';

export default function BulkLabels() {
  const spools = useFilamentStore((s) => s.spools);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);

  const allSelected = spools.length > 0 && selected.size === spools.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(spools.map((s) => s.id)));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handlePrint() {
    if (selected.size === 0 || printing) return;
    setPrinting(true);
    try {
      const selectedSpools = spools.filter((s) => selected.has(s.id));
      const items = await Promise.all(
        selectedSpools.map(async (spool) => {
          const url = spoolQrUrl(spool.id);
          const qrDataUrl = await QRCode.toDataURL(url, { width: 256, margin: 1 });
          const cpg = filamentCostPerG(spool);
          return {
            qrDataUrl,
            line1: `${spool.brand} ${spool.material}`,
            line2: spool.color,
            id: spool.id.slice(0, 12),
            meta: `$${cpg.toFixed(4)}/g`,
          };
        }),
      );
      const html = buildPrintHtml(items, false);
      const win = window.open('', '_blank');
      if (!win) { alert('Allow popups to print labels.'); return; }
      win.document.write(html);
      win.document.close();
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Link
            to="/filament"
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            ← Back
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#1e2a3a]">Bulk Label Print</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Avery 2×2 in · 4 labels per row · select spools to print
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <span className="text-xs text-slate-400">{selected.size} selected</span>
          )}
          <button
            onClick={handlePrint}
            disabled={selected.size === 0 || printing}
            className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {printing ? 'Preparing…' : 'Print Selected Labels'}
          </button>
        </div>
      </div>

      {spools.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-100">
          <div className="text-4xl mb-3">🧵</div>
          <p className="text-sm font-medium text-slate-600 mb-1">No spools yet</p>
          <Link to="/filament" className="text-xs text-[#f97316] hover:underline">
            Add spools in Filament Inventory →
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Select-all header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-4 h-4 rounded accent-[#f97316] cursor-pointer"
            />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Select All ({spools.length})
            </span>
          </div>

          {/* Spool rows */}
          <div className="divide-y divide-slate-50">
            {spools.map((spool) => {
              const url = spoolQrUrl(spool.id);
              const cpg = filamentCostPerG(spool);
              const pct =
                spool.weightTotalG > 0
                  ? Math.round((spool.weightRemainingG / spool.weightTotalG) * 100)
                  : 0;
              return (
                <label
                  key={spool.id}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/60 transition-colors cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(spool.id)}
                    onChange={() => toggle(spool.id)}
                    className="w-4 h-4 rounded accent-[#f97316] cursor-pointer shrink-0"
                  />
                  <div className="shrink-0 border border-slate-100 rounded p-0.5 bg-white">
                    <QRCodeSVG
                      value={url}
                      size={40}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#1e2a3a"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {spool.brand} {spool.material} — {spool.color}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {spool.id.slice(0, 20)}…
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-xs font-semibold text-slate-700">${cpg.toFixed(4)}/g</p>
                    <p className="text-[10px] text-slate-400">
                      {spool.weightRemainingG}g · {pct}%
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
