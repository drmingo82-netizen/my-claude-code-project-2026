import { useState, useRef } from 'react';
import Papa from 'papaparse';
import type { FilamentSpool } from '../../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const TEMPLATE_HEADERS = [
  'Brand',
  'Material Type',
  'Color Name',
  'Spool Weight (g)',
  'Purchase Price ($)',
  'Remaining Weight (g)',
  'Supplier',
];

const TEMPLATE_EXAMPLE = [
  'Hatchbox',
  'PLA',
  'Matte Black',
  '1000',
  '24.99',
  '1000',
  'Amazon',
];

// These must be present for a valid import
const REQUIRED_COLS = ['Brand', 'Material Type', 'Color Name', 'Spool Weight (g)', 'Purchase Price ($)'];

const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'Resin', 'Other'];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedRow {
  id: string;
  brand: string;
  material: string;
  color: string;
  weightTotalG: number;
  weightRemainingG: number;
  costPerSpool: number;
  notes: string;
  incomplete: boolean;
  duplicate: boolean;
}

export type ImportableSpool = Omit<FilamentSpool, 'id'>;

interface Props {
  existingSpools: FilamentSpool[];
  onImport: (rows: ImportableSpool[]) => void;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadTemplate() {
  const csv = [
    TEMPLATE_HEADERS.join(','),
    TEMPLATE_EXAMPLE.map((v) => `"${v}"`).join(','),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'filaments.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeMaterial(raw: string): string {
  const trimmed = raw.trim();
  const match = MATERIALS.find((m) => m.toLowerCase() === trimmed.toLowerCase());
  return match ?? 'Other';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FilamentImportPanel({ existingSpools, onImport, onClose }: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [stage, setStage] = useState<'idle' | 'previewing'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const selectedCount = selected.size;
  const duplicateCount = rows.filter((r) => r.duplicate).length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a .csv file');
      setStage('idle');
      setRows([]);
      return;
    }

    setError('');

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          setError('No data found in this file');
          setStage('idle');
          setRows([]);
          return;
        }

        const fields = results.meta.fields ?? [];
        const missing = REQUIRED_COLS.filter((col) => !fields.includes(col));
        if (missing.length > 0) {
          setError(`Missing required columns: ${missing.join(', ')}`);
          setStage('idle');
          setRows([]);
          return;
        }

        const parsed: ParsedRow[] = (results.data as Record<string, string>[])
          .map((row, i) => {
            const brand = (row['Brand'] ?? '').trim();
            const material = normalizeMaterial(row['Material Type'] ?? '');
            const color = (row['Color Name'] ?? '').trim();
            const weightTotalG = parseFloat(row['Spool Weight (g)'] ?? '') || 0;
            const purchasePrice = parseFloat(row['Purchase Price ($)'] ?? '') || 0;
            const remainingRaw = (row['Remaining Weight (g)'] ?? '').trim();
            const weightRemainingG =
              remainingRaw !== '' ? parseFloat(remainingRaw) || weightTotalG : weightTotalG;
            const notes = (row['Supplier'] ?? '').trim();
            const incomplete = purchasePrice === 0;
            const duplicate = existingSpools.some(
              (s) =>
                s.brand.toLowerCase() === brand.toLowerCase() &&
                s.material.toLowerCase() === material.toLowerCase() &&
                s.color.toLowerCase() === color.toLowerCase(),
            );

            return {
              id: `import-${i}-${Date.now()}`,
              brand,
              material,
              color,
              weightTotalG,
              weightRemainingG,
              costPerSpool: purchasePrice,
              notes,
              incomplete,
              duplicate,
            };
          })
          .filter((r) => r.brand || r.color); // skip rows with no meaningful data

        if (parsed.length === 0) {
          setError('No valid rows found after parsing');
          setStage('idle');
          setRows([]);
          return;
        }

        setRows(parsed);
        // Pre-select non-duplicates
        setSelected(new Set(parsed.filter((r) => !r.duplicate).map((r) => r.id)));
        setStage('previewing');
      },
      error: () => {
        setError('Failed to parse CSV — check the file format');
        setStage('idle');
        setRows([]);
      },
    });
  }

  function handleImport() {
    const toImport: ImportableSpool[] = rows
      .filter((r) => selected.has(r.id))
      .map((r) => ({
        brand: r.brand,
        material: r.material,
        color: r.color,
        weightTotalG: r.weightTotalG,
        weightRemainingG: r.weightRemainingG,
        costPerSpool: r.costPerSpool,
        purchasedAt: new Date().toISOString().slice(0, 10),
        notes: r.notes || undefined,
      }));
    onImport(toImport);
  }

  return (
    <div className="space-y-4">
      {/* Download template */}
      <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <div>
          <p className="text-sm font-medium text-slate-700">Download Template</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            CSV with correct headers + one example row
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white transition-colors font-medium"
        >
          ↓ filaments.csv
        </button>
      </div>

      {/* File picker */}
      <div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-200 rounded-xl py-6 px-4 text-center hover:border-[#f97316]/50 hover:bg-orange-50/20 transition-colors group"
        >
          <p className="text-sm font-medium text-slate-600 group-hover:text-[#f97316] transition-colors">
            {stage === 'previewing' ? 'Choose a different file' : 'Choose CSV file'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">.csv files only</p>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Preview */}
      {stage === 'previewing' && rows.length > 0 && (
        <div className="space-y-3">
          {/* Summary + select controls */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{rows.length}</span> filament
              {rows.length !== 1 ? 's' : ''} found
              {' · '}
              <span className="font-semibold text-[#f97316]">{selectedCount}</span> selected
              {duplicateCount > 0 && (
                <>
                  {' · '}
                  <span className="font-semibold text-amber-600">{duplicateCount}</span> already
                  in inventory
                </>
              )}
            </p>
            <button
              onClick={toggleAll}
              className="text-xs font-medium text-[#f97316] hover:underline shrink-0"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto overflow-y-auto max-h-60">
              <table className="w-full text-xs min-w-[560px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-3 py-2 w-8" />
                    {['Brand', 'Material', 'Color', 'Weight', 'Price', 'Cost/g', 'Status'].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const cpg = row.weightTotalG > 0 ? row.costPerSpool / row.weightTotalG : 0;
                    const isSel = selected.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        onClick={() => toggle(row.id)}
                        className={[
                          'border-b border-slate-50 last:border-0 cursor-pointer transition-colors',
                          isSel ? 'bg-orange-50/25' : 'hover:bg-slate-50/60',
                        ].join(' ')}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggle(row.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3.5 h-3.5 rounded accent-[#f97316]"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                          {row.brand}
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                          {row.material}
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.color}</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                          {row.weightTotalG}g
                        </td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                          {row.costPerSpool > 0 ? `$${row.costPerSpool.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                          {cpg > 0 ? `$${cpg.toFixed(4)}` : '—'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap space-x-1">
                          {row.duplicate && (
                            <span className="inline-block bg-amber-50 text-amber-600 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                              Already exists
                            </span>
                          )}
                          {row.incomplete && (
                            <span className="inline-block bg-orange-50 text-[#f97316] text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                              Price needed
                            </span>
                          )}
                          {!row.duplicate && !row.incomplete && (
                            <span className="inline-block bg-emerald-50 text-emerald-600 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                              Ready
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        {stage === 'previewing' && (
          <button
            type="button"
            onClick={handleImport}
            disabled={selectedCount === 0}
            className="flex-1 py-2.5 rounded-lg bg-[#f97316] text-white text-sm font-medium hover:bg-[#ea6d0f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Import {selectedCount > 0
              ? `${selectedCount} Spool${selectedCount !== 1 ? 's' : ''}`
              : 'Selected'}
          </button>
        )}
      </div>
    </div>
  );
}
