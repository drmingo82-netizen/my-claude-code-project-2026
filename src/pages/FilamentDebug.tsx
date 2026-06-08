import { useState, useRef } from 'react';
import { parse3MF } from '../lib/parse3mf';
import {
  extractGcodeFrom3mf,
  parseGcodeExtrusion,
  extrusionToGrams,
  MATERIAL_DENSITIES,
  type ExtrusionByTool,
} from '../utils/filamentCalc';
import type { Parsed3MF } from '../lib/parse3mf';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GcodeResult {
  extrusionMm: ExtrusionByTool;
  gramsPerSlot: Record<number, number>;
  totalGrams: number;
  materialUsed: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number, dec = 2) => n.toFixed(dec);

function statusBadge(pct: number) {
  const diff = Math.abs(pct);
  if (diff <= 5) return { label: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% ✓ within 5%`, cls: 'bg-emerald-100 text-emerald-700' };
  if (diff <= 10) return { label: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% ⚠ within 10%`, cls: 'bg-amber-100 text-amber-700' };
  return { label: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% ✗ >10% off`, cls: 'bg-red-100 text-red-700' };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FilamentDebug() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [material, setMaterial] = useState('PLA');
  const [diameter, setDiameter] = useState(1.75);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metaResult, setMetaResult] = useState<Parsed3MF | null>(null);
  const [gcodeResult, setGcodeResult] = useState<GcodeResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setMetaResult(null);
    setGcodeResult(null);
    setFileName(file.name);
    setLoading(true);

    try {
      const isGcode = file.name.endsWith('.gcode');

      // ── Metadata path (3MF only) ──
      if (!isGcode) {
        const meta = await parse3MF(file);
        setMetaResult(meta);
      }

      // ── G-code path ──
      let gcodeText: string;
      if (isGcode) {
        gcodeText = await file.text();
      } else {
        gcodeText = await extractGcodeFrom3mf(file);
      }

      const density = MATERIAL_DENSITIES[material] ?? MATERIAL_DENSITIES.PLA;
      const extrusionMm = parseGcodeExtrusion(gcodeText);

      const gramsPerSlot: Record<number, number> = {};
      let totalGrams = 0;
      for (const [slot, mm] of Object.entries(extrusionMm)) {
        const g = extrusionToGrams(mm, density, diameter);
        gramsPerSlot[Number(slot)] = g;
        totalGrams += g;
      }

      setGcodeResult({ extrusionMm, gramsPerSlot, totalGrams, materialUsed: material });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  const activeSlots = gcodeResult
    ? Object.entries(gcodeResult.gramsPerSlot).filter(([, g]) => g > 0.01)
    : [];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🧪</span>
            <h1 className="text-lg font-semibold text-slate-800">Filament Calc — Dev Debugger</h1>
          </div>
          <p className="text-sm text-slate-500">
            Drop a <code className="bg-slate-100 px-1 rounded text-xs">.3mf</code> or{' '}
            <code className="bg-slate-100 px-1 rounded text-xs">.gcode</code> file to verify
            G-code extrusion math against Bambu Studio's metadata values.
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Material</label>
            <select
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {Object.keys(MATERIAL_DENSITIES).map((m) => (
                <option key={m} value={m}>{m} ({MATERIAL_DENSITIES[m]} g/cm³)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Diameter (mm)</label>
            <select
              value={diameter}
              onChange={(e) => setDiameter(Number(e.target.value))}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value={1.75}>1.75 mm</option>
              <option value={2.85}>2.85 mm</option>
            </select>
          </div>
          <p className="text-xs text-slate-400 self-end pb-2">
            Density: <strong>{MATERIAL_DENSITIES[material] ?? '—'} g/cm³</strong>
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="bg-white rounded-xl border-2 border-dashed border-slate-300 hover:border-orange-400 transition-colors p-10 flex flex-col items-center gap-3 cursor-pointer"
        >
          <span className="text-4xl">📂</span>
          <p className="text-sm font-medium text-slate-600">
            Drop a <code>.3mf</code> or <code>.gcode</code> file, or click to browse
          </p>
          {fileName && (
            <p className="text-xs text-slate-400 font-mono">{fileName}</p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".3mf,.gcode"
            onChange={onInputChange}
            className="hidden"
          />
        </div>

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500 text-sm">
            Parsing file…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Results */}
        {(metaResult || gcodeResult) && !loading && (
          <div className="space-y-4">

            {/* Side-by-side comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Metadata result (Bambu slice_info.config) */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <span>📋</span> Bambu Metadata
                  <span className="text-xs font-normal text-slate-400">(slice_info.config)</span>
                </h2>
                {metaResult ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Print time</span>
                      <span className="font-medium">{(metaResult.printTimeHours * 60).toFixed(0)} min</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Total grams</span>
                      <span className="font-medium">{fmt(metaResult.totalGrams)} g</span>
                    </div>
                    <div className="border-t border-slate-100 pt-2 mt-2 space-y-1">
                      {metaResult.filamentPerSlot.map((f) => (
                        <div key={f.slot} className="flex justify-between text-xs text-slate-600">
                          <span>AMS slot {f.slot}</span>
                          <span>{fmt(f.grams)} g</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    No metadata found (G-code file or metadata missing from 3MF)
                  </p>
                )}
              </div>

              {/* G-code calc result */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <span>⚙️</span> G-code Math
                  <span className="text-xs font-normal text-slate-400">({gcodeResult?.materialUsed})</span>
                </h2>
                {gcodeResult && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Total grams</span>
                      <span className="font-medium">{fmt(gcodeResult.totalGrams)} g</span>
                    </div>
                    <div className="border-t border-slate-100 pt-2 mt-2 space-y-1">
                      {activeSlots.length > 0 ? (
                        activeSlots.map(([slot, grams]) => (
                          <div key={slot} className="flex justify-between text-xs text-slate-600">
                            <span>Tool {slot}</span>
                            <span>
                              {fmt(gcodeResult.extrusionMm[Number(slot)])} mm →{' '}
                              <strong>{fmt(grams)} g</strong>
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 italic">No extrusion detected</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Accuracy comparison (only when both results exist) */}
            {metaResult && gcodeResult && metaResult.totalGrams > 0 && gcodeResult.totalGrams > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-3">Accuracy vs. Bambu Metadata</h2>
                <div className="space-y-2">
                  {(() => {
                    const pct = ((gcodeResult.totalGrams - metaResult.totalGrams) / metaResult.totalGrams) * 100;
                    const badge = statusBadge(pct);
                    return (
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-600">
                          G-code calc: <strong>{fmt(gcodeResult.totalGrams)} g</strong>
                          {' vs '}
                          Metadata: <strong>{fmt(metaResult.totalGrams)} g</strong>
                        </div>
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                    );
                  })()}
                  <p className="text-xs text-slate-400">
                    Target: G-code path within ±5% of Bambu's reported value.
                    If significantly off, check material selection above.
                  </p>
                </div>
              </div>
            )}

            {/* Raw extrusion data */}
            {gcodeResult && (
              <details className="bg-white rounded-xl border border-slate-200">
                <summary className="px-5 py-3 text-sm font-medium text-slate-600 cursor-pointer select-none">
                  Raw extrusion data (mm per tool)
                </summary>
                <div className="px-5 pb-4">
                  <pre className="text-xs bg-slate-50 rounded-lg p-3 overflow-x-auto text-slate-700">
                    {JSON.stringify(gcodeResult.extrusionMm, null, 2)}
                  </pre>
                </div>
              </details>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
