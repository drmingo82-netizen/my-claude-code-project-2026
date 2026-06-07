import { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useFilamentStore } from '../stores/filamentStore';
import { useAmsPresetStore } from '../stores/amsPresetStore';
import {
  hexToHsl, isDark, generateColorFromName,
  complementaryHex, analogousHexes, triadicHexes, colorMatches,
} from '../utils/colorUtils';
import type { FilamentSpool, AmsSlotColor, AmsPreset } from '../types';

// ── Internal types ─────────────────────────────────────────────────────────────

interface ColorEntry {
  hex: string;
  name: string;
  brands: string[];
  materials: string[];
  spoolCount: number;
  hsl: { h: number; s: number; l: number };
  generated: boolean;
}

type SortKey = 'hue' | 'brand' | 'material' | 'name';

// ── Derived data ───────────────────────────────────────────────────────────────

function buildColorEntries(spools: FilamentSpool[]): ColorEntry[] {
  const map = new Map<string, ColorEntry>();
  for (const spool of spools) {
    const key = spool.color.trim().toLowerCase();
    if (!map.has(key)) {
      const hex = spool.colorHex || generateColorFromName(spool.color);
      map.set(key, {
        hex,
        name: spool.color,
        brands: [],
        materials: [],
        spoolCount: 0,
        hsl: hexToHsl(hex),
        generated: !spool.colorHex,
      });
    }
    const entry = map.get(key)!;
    if (spool.colorHex && entry.generated) {
      entry.hex = spool.colorHex;
      entry.hsl = hexToHsl(spool.colorHex);
      entry.generated = false;
    }
    if (!entry.brands.includes(spool.brand)) entry.brands.push(spool.brand);
    if (!entry.materials.includes(spool.material)) entry.materials.push(spool.material);
    entry.spoolCount++;
  }
  return [...map.values()];
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ColorSwatchCard({
  entry,
  isSelected,
  onSelect,
  onDragStart,
}: {
  entry: ColorEntry;
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const dark = isDark(entry.hex);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onSelect}
      className={[
        'bg-white rounded-xl border-2 cursor-pointer transition-all hover:shadow-md select-none',
        isSelected
          ? 'border-[#f97316] shadow-md ring-2 ring-[#f97316]/20'
          : 'border-slate-100 hover:border-slate-200',
      ].join(' ')}
    >
      <div className="flex justify-center pt-4 pb-2">
        <div
          className="w-10 h-10 rounded-full shadow-inner border-2 border-white/60 shadow-md flex items-center justify-center"
          style={{ backgroundColor: entry.hex }}
        >
          {entry.generated && (
            <span className={`text-[9px] font-bold ${dark ? 'text-white/50' : 'text-black/30'}`}>~</span>
          )}
        </div>
      </div>
      <div className="px-2 pb-3 text-center">
        <p className="text-xs font-semibold text-slate-800 truncate leading-tight">{entry.name}</p>
        <p className="text-[10px] text-slate-400 truncate mt-0.5">
          {entry.brands.slice(0, 2).join(', ')}
        </p>
        <div className="flex items-center justify-center gap-1 mt-1.5 flex-wrap">
          {entry.materials.slice(0, 2).map((m) => (
            <span key={m} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
              {m}
            </span>
          ))}
          {entry.spoolCount > 1 && (
            <span className="text-[9px] bg-orange-50 text-[#f97316] px-1.5 py-0.5 rounded-full font-bold">
              ×{entry.spoolCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PairingBubble({
  hex,
  match,
}: {
  hex: string;
  match: ColorEntry | undefined;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={[
          'w-10 h-10 rounded-full border-2 shadow-sm',
          match ? 'border-emerald-400' : 'border-slate-200',
        ].join(' ')}
        style={{ backgroundColor: hex }}
        title={hex}
      />
      <div className="text-center max-w-[72px]">
        <p className={`text-[9px] font-medium truncate ${match ? 'text-emerald-700' : 'text-slate-400'}`}>
          {match ? match.name : 'Missing'}
        </p>
        <p className="text-[8px] text-slate-300 font-mono">{hex}</p>
      </div>
      {match && (
        <span className="text-[8px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-semibold -mt-0.5">
          In stock
        </span>
      )}
    </div>
  );
}

function AmsSlotBox({
  index,
  color,
  isDragOver,
  onDrop,
  onDragOver,
  onDragLeave,
  onClear,
  onClickEmpty,
}: {
  index: number;
  color: AmsSlotColor | null;
  isDragOver: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onClear: () => void;
  onClickEmpty: () => void;
}) {
  if (color) {
    const dark = isDark(color.colorHex);
    const textCls = dark ? 'text-white' : 'text-black/80';
    const subCls = dark ? 'text-white/60' : 'text-black/50';
    const btnCls = dark
      ? 'bg-white/20 hover:bg-white/40 text-white'
      : 'bg-black/10 hover:bg-black/25 text-black/70';
    return (
      <div
        className="relative flex-1 min-w-0 h-24 rounded-xl flex flex-col items-center justify-center gap-0.5 shadow-sm overflow-hidden"
        style={{ backgroundColor: color.colorHex }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <span className={`text-[10px] font-bold ${textCls} absolute top-1.5 left-2`}>
          AMS {index + 1}
        </span>
        <span className={`text-xs font-semibold ${textCls} text-center px-2 leading-tight`}>
          {color.colorName}
        </span>
        {color.material && (
          <span className={`text-[10px] ${subCls}`}>{color.material}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs transition-colors ${btnCls}`}
        >
          ×
        </button>
      </div>
    );
  }
  return (
    <div
      onClick={onClickEmpty}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={[
        'flex-1 min-w-0 h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors',
        isDragOver
          ? 'border-[#f97316] bg-orange-50/60'
          : 'border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100',
      ].join(' ')}
    >
      <span className="text-2xl text-slate-200 leading-none">+</span>
      <span className="text-[10px] text-slate-400 font-medium">AMS {index + 1}</span>
      <span className="text-[9px] text-slate-300">drop or tap</span>
    </div>
  );
}

function PresetRow({
  preset,
  onDelete,
  onLoad,
}: {
  preset: AmsPreset;
  onDelete: () => void;
  onLoad: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
      <div className="flex gap-1 shrink-0">
        {preset.slots.map((slot, i) => (
          <div
            key={i}
            className="w-5 h-5 rounded-full border border-white shadow-sm"
            style={{ backgroundColor: slot?.colorHex ?? '#e2e8f0' }}
            title={slot?.colorName ?? 'Empty'}
          />
        ))}
      </div>
      <p className="flex-1 text-sm font-medium text-slate-700 truncate">{preset.name}</p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onLoad}
          className="text-xs text-[#f97316] hover:underline font-medium"
        >
          Load
        </button>
        <button
          onClick={onDelete}
          className="text-xs text-slate-400 hover:text-red-500 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Colors() {
  const spools = useFilamentStore((s) => s.spools);
  const { presets, addPreset, deletePreset } = useAmsPresetStore();

  const [filterMaterial, setFilterMaterial] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('hue');
  const [selected, setSelected] = useState<ColorEntry | null>(null);
  const [amsSlots, setAmsSlots] = useState<(AmsSlotColor | null)[]>([null, null, null, null]);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [presetName, setPresetName] = useState('');

  const detailRef = useRef<HTMLDivElement>(null);

  // ── Derived data
  const colorEntries = useMemo(() => buildColorEntries(spools), [spools]);
  const allMaterials = useMemo(
    () => [...new Set(spools.map((s) => s.material))].sort(),
    [spools],
  );

  const displayed = useMemo(() => {
    let result = filterMaterial
      ? colorEntries.filter((e) => e.materials.includes(filterMaterial))
      : colorEntries;
    switch (sortBy) {
      case 'hue':      result = [...result].sort((a, b) => a.hsl.h - b.hsl.h); break;
      case 'name':     result = [...result].sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'brand':    result = [...result].sort((a, b) => (a.brands[0] ?? '').localeCompare(b.brands[0] ?? '')); break;
      case 'material': result = [...result].sort((a, b) => (a.materials[0] ?? '').localeCompare(b.materials[0] ?? '')); break;
    }
    return result;
  }, [colorEntries, filterMaterial, sortBy]);

  // ── Color pairing data
  const pairingData = useMemo(() => {
    if (!selected) return null;
    const comp = complementaryHex(selected.hex);
    const [ana1, ana2] = analogousHexes(selected.hex);
    const [tri1, tri2] = triadicHexes(selected.hex);
    const find = (hex: string) => colorEntries.find((e) => colorMatches(e.hex, hex));
    return {
      complementary: [{ hex: comp, match: find(comp) }],
      analogous: [{ hex: ana1, match: find(ana1) }, { hex: ana2, match: find(ana2) }],
      triadic: [{ hex: tri1, match: find(tri1) }, { hex: tri2, match: find(tri2) }],
    };
  }, [selected, colorEntries]);

  const missingPairings = useMemo(() => {
    if (!pairingData) return [];
    return [
      ...pairingData.complementary,
      ...pairingData.analogous,
      ...pairingData.triadic,
    ].filter((p) => !p.match);
  }, [pairingData]);

  // ── Drag handlers
  function makeDragData(entry: ColorEntry): AmsSlotColor {
    return {
      colorHex: entry.hex,
      colorName: entry.name,
      brand: entry.brands[0],
      material: entry.materials[0],
    };
  }

  function handleDragStart(e: React.DragEvent, entry: ColorEntry) {
    e.dataTransfer.setData('text/plain', JSON.stringify(makeDragData(entry)));
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleSlotDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    try {
      const data: AmsSlotColor = JSON.parse(e.dataTransfer.getData('text/plain'));
      setAmsSlots((prev) => { const n = [...prev]; n[idx] = data; return n; });
    } catch { /* ignore */ }
    setDragOver(null);
  }

  function handleSlotDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(idx);
  }

  // Mobile: click selected color into next empty AMS slot
  function addSelectedToAms() {
    if (!selected) return;
    const data = makeDragData(selected);
    setAmsSlots((prev) => {
      const n = [...prev];
      const i = n.findIndex((s) => s === null);
      if (i !== -1) n[i] = data;
      return n;
    });
  }

  function clearSlot(idx: number) {
    setAmsSlots((prev) => { const n = [...prev]; n[idx] = null; return n; });
  }

  function savePreset() {
    const name = presetName.trim();
    if (!name || amsSlots.every((s) => s === null)) return;
    addPreset({ name, slots: amsSlots, createdAt: new Date().toISOString() });
    setPresetName('');
  }

  function loadPreset(preset: AmsPreset) {
    setAmsSlots([...preset.slots]);
  }

  function handleSwatchSelect(entry: ColorEntry) {
    if (selected?.name === entry.name) {
      setSelected(null);
    } else {
      setSelected(entry);
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
  }

  // ── Render
  if (spools.length === 0) {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="hidden lg:block text-xl font-bold text-[#1e2a3a]">My Colors</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-100">
          <div className="text-4xl mb-3">🎨</div>
          <p className="text-sm font-medium text-slate-600 mb-1">No spools in inventory</p>
          <p className="text-xs text-slate-400 mb-4">
            Add filament spools to see your color palette here.
          </p>
          <Link
            to="/filament"
            className="bg-[#f97316] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#ea6d0f] transition-colors"
          >
            Go to Filament Inventory →
          </Link>
        </div>
      </div>
    );
  }

  const anyHasHex = spools.some((s) => s.colorHex);

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="hidden lg:block text-xl font-bold text-[#1e2a3a]">My Colors</h1>
          <p className="text-xs text-slate-400 lg:mt-0.5">
            {colorEntries.length} color{colorEntries.length !== 1 ? 's' : ''} across {spools.length} spools
          </p>
        </div>
        {!anyHasHex && (
          <Link
            to="/filament"
            className="text-xs text-slate-400 hover:text-[#f97316] transition-colors"
          >
            Add hex codes in Filament for exact colors →
          </Link>
        )}
      </div>

      {/* Filter + sort bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterMaterial('')}
            className={[
              'text-xs px-3 py-1.5 rounded-lg font-medium transition-colors',
              !filterMaterial ? 'bg-[#1e2a3a] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
            ].join(' ')}
          >
            All
          </button>
          {allMaterials.map((m) => (
            <button
              key={m}
              onClick={() => setFilterMaterial(filterMaterial === m ? '' : m)}
              className={[
                'text-xs px-3 py-1.5 rounded-lg font-medium transition-colors',
                filterMaterial === m ? 'bg-[#1e2a3a] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
              ].join(' ')}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-slate-400">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#f97316]"
          >
            <option value="hue">By Hue</option>
            <option value="name">By Name</option>
            <option value="brand">By Brand</option>
            <option value="material">By Material</option>
          </select>
        </div>
      </div>

      {/* Color grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {displayed.map((entry) => (
          <ColorSwatchCard
            key={entry.name}
            entry={entry}
            isSelected={selected?.name === entry.name}
            onSelect={() => handleSwatchSelect(entry)}
            onDragStart={(e) => handleDragStart(e, entry)}
          />
        ))}
      </div>

      {/* Color detail panel */}
      {selected && pairingData && (
        <div ref={detailRef} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-start gap-4 flex-wrap">
            {/* Selected color */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div
                className="w-16 h-16 rounded-full shadow-md border-4 border-white ring-1 ring-slate-100"
                style={{ backgroundColor: selected.hex }}
              />
              <p className="text-xs font-semibold text-slate-800 text-center">{selected.name}</p>
              <p className="text-[10px] font-mono text-slate-400">{selected.hex}</p>
              {selected.generated && (
                <p className="text-[9px] text-amber-500 text-center">~Estimated color</p>
              )}
              <button
                onClick={addSelectedToAms}
                className="text-[10px] font-medium text-[#f97316] hover:underline whitespace-nowrap"
              >
                + Add to AMS →
              </button>
            </div>

            {/* Pairing suggestions */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-600 mb-3">Colors that pair well</p>
              <div className="space-y-3">
                {/* Complementary */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Complementary
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    {pairingData.complementary.map((p) => (
                      <PairingBubble key={p.hex} hex={p.hex} match={p.match} />
                    ))}
                  </div>
                </div>
                {/* Analogous */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Analogous (±30°)
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    {pairingData.analogous.map((p) => (
                      <PairingBubble key={p.hex} hex={p.hex} match={p.match} />
                    ))}
                  </div>
                </div>
                {/* Triadic */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Triadic (120°)
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    {pairingData.triadic.map((p) => (
                      <PairingBubble key={p.hex} hex={p.hex} match={p.match} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Missing colors */}
            {missingPairings.length > 0 && (
              <div className="w-full border-t border-slate-50 pt-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Missing from inventory
                </p>
                <div className="flex gap-2 flex-wrap">
                  {missingPairings.map((p) => (
                    <span
                      key={p.hex}
                      className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-xs text-slate-500"
                    >
                      <span
                        className="w-3 h-3 rounded-full inline-block border border-slate-200"
                        style={{ backgroundColor: p.hex }}
                      />
                      {p.hex}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AMS Planner */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-[#1e2a3a]">AMS Planner</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Drag color swatches into slots, or click a swatch then "Add to AMS"
            </p>
          </div>
          <button
            onClick={() => setAmsSlots([null, null, null, null])}
            disabled={amsSlots.every((s) => s === null)}
            className="text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30"
          >
            Clear all
          </button>
        </div>

        {/* 4-slot grid */}
        <div className="flex gap-2 mb-4">
          {amsSlots.map((color, i) => (
            <AmsSlotBox
              key={i}
              index={i}
              color={color}
              isDragOver={dragOver === i}
              onDrop={(e) => handleSlotDrop(e, i)}
              onDragOver={(e) => handleSlotDragOver(e, i)}
              onDragLeave={() => setDragOver(null)}
              onClear={() => clearSlot(i)}
              onClickEmpty={addSelectedToAms}
            />
          ))}
        </div>

        {/* Color combination preview strip */}
        {amsSlots.some((s) => s !== null) && (
          <div className="flex h-3 rounded-full overflow-hidden mb-4 gap-px">
            {amsSlots.map((s, i) => (
              <div
                key={i}
                className="flex-1 h-full"
                style={{ backgroundColor: s?.colorHex ?? '#f1f5f9' }}
              />
            ))}
          </div>
        )}

        {/* Save preset */}
        <div className="flex gap-2">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && savePreset()}
            placeholder="Preset name…"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
          />
          <button
            onClick={savePreset}
            disabled={!presetName.trim() || amsSlots.every((s) => s === null)}
            className="text-sm px-4 py-2 rounded-lg bg-[#f97316] text-white font-medium hover:bg-[#ea6d0f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Save Preset
          </button>
        </div>
      </div>

      {/* Saved presets */}
      {presets.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <p className="text-sm font-semibold text-[#1e2a3a] mb-3">
            Saved Presets ({presets.length})
          </p>
          <div className="space-y-2">
            {presets.map((preset) => (
              <PresetRow
                key={preset.id}
                preset={preset}
                onDelete={() => deletePreset(preset.id)}
                onLoad={() => loadPreset(preset)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
