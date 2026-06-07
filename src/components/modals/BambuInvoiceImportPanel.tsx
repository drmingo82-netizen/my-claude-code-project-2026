import { useState, useRef, useCallback } from 'react';
import { parseBambuInvoice } from '../../lib/parseBambuInvoice';
import type { BambuLineItem } from '../../lib/parseBambuInvoice';
import type { ImportableSpool } from './FilamentImportPanel';

interface Props {
  onImport: (spools: ImportableSpool[]) => void;
  onClose: () => void;
}

const fmt2 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function ColorSwatch({ hex, size = 20 }: { hex?: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full border border-slate-200 shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: hex ?? '#e2e8f0',
      }}
      title={hex ?? 'Unknown color'}
    />
  );
}

export default function BambuInvoiceImportPanel({ onImport, onClose }: Props) {
  type PanelState = 'idle' | 'parsing' | 'preview' | 'error';
  const [panelState, setPanelState] = useState<PanelState>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [items, setItems] = useState<BambuLineItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [invoiceDate, setInvoiceDate] = useState<string | undefined>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorMsg('Please upload a PDF file.');
      setPanelState('error');
      return;
    }
    setPanelState('parsing');
    const result = await parseBambuInvoice(file);
    if (result.error) {
      setErrorMsg(result.error);
      setWarnings(result.warnings);
      setPanelState('error');
      return;
    }
    setItems(result.items);
    setInvoiceDate(result.invoiceDate);
    setWarnings(result.warnings);
    setSelected(new Set(result.items.map((i) => i.id)));
    setPanelState('preview');
  }

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleFile(file);
  }, []);

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() { setSelected(new Set(items.map((i) => i.id))); }
  function deselectAll() { setSelected(new Set()); }

  function handleImport() {
    const spools: ImportableSpool[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const purchasedAt = invoiceDate
      ? (() => { try { return new Date(invoiceDate).toISOString().slice(0, 10); } catch { return today; } })()
      : today;

    for (const item of items) {
      if (!selected.has(item.id)) continue;
      for (let u = 0; u < item.qty; u++) {
        spools.push({
          brand: 'Bambu Lab',
          material: item.material,
          color: item.colorName,
          colorHex: item.colorHex,
          weightTotalG: item.weightG,
          weightRemainingG: item.weightG,
          costPerSpool: item.pricePerUnit,
          purchasedAt,
          notes: item.sku ? `SKU: ${item.sku}${item.spoolType === 'Refill' ? ' · Refill' : ''}` : undefined,
        });
      }
    }
    onImport(spools);
  }

  const selectedUnitCount = items
    .filter((i) => selected.has(i.id))
    .reduce((sum, i) => sum + i.qty, 0);

  // ── Idle / drop zone ────────────────────────────────────────────────────────

  if (panelState === 'idle' || panelState === 'parsing') {
    return (
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Upload your Bambu Lab order invoice PDF. Each filament line item will be parsed into
          individual spool records.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={[
            'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-12 cursor-pointer transition-colors',
            dragOver
              ? 'border-[#f97316] bg-orange-50'
              : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100',
          ].join(' ')}
        >
          {panelState === 'parsing' ? (
            <>
              <div className="w-8 h-8 border-2 border-[#f97316] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Parsing invoice…</p>
            </>
          ) : (
            <>
              <div className="text-3xl select-none">📄</div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">
                  Drop your Bambu Lab invoice here
                </p>
                <p className="text-xs text-slate-400 mt-0.5">or click to browse · PDF only</p>
              </div>
              <div className="text-[10px] font-medium text-slate-400 bg-white border border-slate-200 px-2.5 py-1 rounded-full">
                Bambu Lab Store Invoice (.pdf)
              </div>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────

  if (panelState === 'error') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700 mb-1">Could not parse invoice</p>
          <p className="text-xs text-red-600">{errorMsg}</p>
          {warnings.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i} className="text-xs text-red-500">{w}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setPanelState('idle'); setErrorMsg(''); setWarnings([]); }}
            className="flex-1 py-2.5 rounded-lg bg-[#f97316] text-white text-sm font-medium hover:bg-[#ea6d0f] transition-colors"
          >
            Try another file
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Preview ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Invoice meta */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {items.length} line item{items.length !== 1 ? 's' : ''} found
          {invoiceDate ? ` · ${invoiceDate}` : ''}
        </span>
        <div className="flex items-center gap-3">
          <button onClick={selectAll} className="text-[#f97316] hover:underline font-medium">
            Select All
          </button>
          <button onClick={deselectAll} className="text-slate-400 hover:text-slate-600 transition-colors">
            Deselect All
          </button>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-700 mb-1">Warnings</p>
          <ul className="space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-600">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview table */}
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-xs min-w-[560px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-3 py-2 text-left w-8" />
              <th className="px-3 py-2 text-left text-slate-500 font-semibold">Color</th>
              <th className="px-3 py-2 text-left text-slate-500 font-semibold">Material</th>
              <th className="px-3 py-2 text-left text-slate-500 font-semibold">Weight</th>
              <th className="px-3 py-2 text-center text-slate-500 font-semibold">Qty</th>
              <th className="px-3 py-2 text-right text-slate-500 font-semibold">Price/Spool</th>
              <th className="px-3 py-2 text-right text-slate-500 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={[
                  'border-b border-slate-50 last:border-0 cursor-pointer transition-colors',
                  selected.has(item.id) ? 'bg-white hover:bg-slate-50/50' : 'bg-slate-50/60 opacity-50',
                ].join(' ')}
              >
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleItem(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-[#f97316]"
                  />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <ColorSwatch hex={item.colorHex} />
                    <div>
                      <p className="font-medium text-slate-700">{item.colorName}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{item.colorCode}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-block bg-[#1e2a3a]/10 text-[#1e2a3a] font-medium px-2 py-0.5 rounded-full">
                    {item.material}
                  </span>
                  {item.spoolType === 'Refill' && (
                    <span className="ml-1.5 text-[10px] text-slate-400">Refill</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-slate-600">{item.weightG}g</td>
                <td className="px-3 py-2.5 text-center font-semibold text-slate-700">
                  {item.qty}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-600">
                  {item.pricePerUnit > 0 ? fmt2(item.pricePerUnit) : '—'}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-slate-700">
                  {item.pricePerUnit > 0 ? fmt2(item.pricePerUnit * item.qty) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setPanelState('idle'); setItems([]); setWarnings([]); }}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          ← Try another file
        </button>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="px-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleImport}
          disabled={selectedUnitCount === 0}
          className="px-5 py-2.5 rounded-lg bg-[#f97316] text-white text-sm font-medium hover:bg-[#ea6d0f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Import {selectedUnitCount > 0 ? `${selectedUnitCount} spool${selectedUnitCount !== 1 ? 's' : ''}` : ''}
        </button>
      </div>
    </div>
  );
}
