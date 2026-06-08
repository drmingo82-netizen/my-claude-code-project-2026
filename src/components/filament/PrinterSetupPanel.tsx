import { useFilamentStore } from '../../stores/filamentStore';
import { generateColorFromName, isDark } from '../../utils/colorUtils';

const PRINTERS = [
  { id: 'p1s', name: 'Bambu Lab P1S' },
  { id: 'h2s', name: 'Bambu Lab H2S' },
];

function relTime(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (min < 1440) return `${Math.floor(min / 60)}h ago`;
  return `${Math.floor(min / 1440)}d ago`;
}

function SlotCard({ printerId, slot }: { printerId: string; slot: number }) {
  const spools = useFilamentStore((s) => s.spools);
  const amsMappings = useFilamentStore((s) => s.amsMappings);
  const setAmsMapping = useFilamentStore((s) => s.setAmsMapping);
  const clearAmsMapping = useFilamentStore((s) => s.clearAmsMapping);

  const mapping = amsMappings.find(
    (m) => m.printerId === printerId && m.amsSlot === slot,
  );
  const spool = mapping ? spools.find((s) => s.id === mapping.spoolId) : null;
  const hex = spool?.colorHex ?? (spool ? generateColorFromName(spool.color) : null);
  const dark = hex ? isDark(hex) : false;
  const pct =
    spool && spool.weightTotalG > 0
      ? (spool.weightRemainingG / spool.weightTotalG) * 100
      : null;

  return (
    <div className="flex flex-col gap-2 p-3 bg-slate-50/70 rounded-xl border border-slate-100 min-w-0">
      {/* Color swatch + last-updated timestamp */}
      <div className="flex items-center justify-between gap-1">
        <div
          className="w-9 h-9 rounded-full border-2 border-white shadow-sm shrink-0 flex items-center justify-center"
          style={{ backgroundColor: hex ?? '#e2e8f0' }}
          title={hex ?? 'No spool assigned'}
        >
          <span
            className={`text-[11px] font-bold leading-none ${
              hex ? (dark ? 'text-white/60' : 'text-black/40') : 'text-slate-400'
            }`}
          >
            {slot + 1}
          </span>
        </div>
        {mapping?.assignedAt && (
          <span className="text-[10px] text-slate-300 whitespace-nowrap">
            {relTime(mapping.assignedAt)}
          </span>
        )}
      </div>

      {/* Spool label */}
      {spool ? (
        <div className="text-[11px] leading-tight">
          <span className="font-semibold text-slate-700">
            {spool.brand} {spool.material}
          </span>
          <br />
          <span className="text-slate-500">{spool.color}</span>
        </div>
      ) : (
        <div className="text-[11px] text-slate-300 italic">Empty</div>
      )}

      {/* Remaining weight bar */}
      {spool && pct !== null && (
        <div>
          <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
            <span>{spool.weightRemainingG}g</span>
            <span className={pct < 20 ? 'text-red-500 font-semibold' : ''}>
              {Math.round(pct)}%
            </span>
          </div>
          <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                pct < 20 ? 'bg-red-400' : pct < 50 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Assignment dropdown */}
      <select
        value={mapping?.spoolId ?? ''}
        onChange={(e) => {
          if (e.target.value) setAmsMapping(printerId, slot, e.target.value);
          else clearAmsMapping(printerId, slot);
        }}
        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#f97316] truncate"
      >
        <option value="">— Empty —</option>
        {spools.map((s) => (
          <option key={s.id} value={s.id}>
            {s.brand} {s.material} {s.color} ({s.weightRemainingG}g)
          </option>
        ))}
      </select>
    </div>
  );
}

function PrinterBlock({ id, name }: { id: string; name: string }) {
  const amsMappings = useFilamentStore((s) => s.amsMappings);
  const assignedCount = amsMappings.filter((m) => m.printerId === id).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-semibold text-slate-600">{name}</p>
        <span className="text-[10px] text-slate-400">
          {assignedCount}/4 slots assigned
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((slot) => (
          <SlotCard key={slot} printerId={id} slot={slot} />
        ))}
      </div>
    </div>
  );
}

export default function PrinterSetupPanel() {
  const spools = useFilamentStore((s) => s.spools);

  return (
    <div className="mt-6 bg-white rounded-xl border border-slate-100 shadow-sm p-4">
      <div className="mb-4">
        <p className="text-sm font-semibold text-[#1e2a3a]">Printer Setup</p>
        <p className="text-xs text-slate-400 mt-0.5">
          Assign a spool to each AMS slot before printing. Drives cost tracking and filament estimates.
        </p>
      </div>

      {spools.length === 0 ? (
        <p className="text-xs text-slate-400">
          Add spools to inventory first, then assign them here.
        </p>
      ) : (
        <div className="space-y-5">
          {PRINTERS.map((p) => (
            <PrinterBlock key={p.id} id={p.id} name={p.name} />
          ))}
        </div>
      )}
    </div>
  );
}
