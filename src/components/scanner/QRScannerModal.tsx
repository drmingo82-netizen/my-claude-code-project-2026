import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQRScanner } from '../../hooks/useQRScanner';
import { useFilamentStore } from '../../stores/filamentStore';
import type { FilamentSpool } from '../../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanTab = 'my-spools' | 'new-spool';

interface UpcLookupResult {
  brand: string;
  material: string;
  weightG: number;
  confidence: 'high' | 'medium' | 'low';
  rawTitle: string;
}

interface NewSpoolDetected {
  brand: string;
  material: string;
  weightG: number;
  confidence: 'high' | 'medium' | 'low';
  rawTitle: string;
  source: 'bambu' | 'upc';
}

interface AddSpoolModalState {
  open: boolean;
  prefill: Partial<Omit<FilamentSpool, 'id'>> | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isTactileQr(text: string): boolean {
  return text.includes('tactile-creations.vercel.app/scan') ||
    text.includes('localhost') && text.includes('/scan');
}

function isUpc(text: string): boolean {
  return /^\d{8,13}$/.test(text.trim());
}

function isBambuUrl(text: string): boolean {
  return text.includes('bambulab.com') || text.includes('bambu-lab.com');
}

function parseBambuUrl(url: string): Partial<Omit<FilamentSpool, 'id'>> {
  // Bambu filament URLs encode material/color in the slug, e.g.
  // https://bambulab.com/en-us/filament/basic-pla-matte-black-1kg
  const slug = url.split('/').pop() ?? '';
  const parts = slug.toLowerCase().replace(/-/g, ' ');

  const materials = ['pla matte', 'pla silk', 'pla basic', 'pla', 'petg', 'abs', 'tpu', 'asa', 'pa'];
  let material = 'PLA';
  for (const m of materials) {
    if (parts.includes(m)) {
      material = m.toUpperCase().replace(' ', ' ');
      break;
    }
  }

  const weightMatch = parts.match(/(\d+)\s*kg/);
  const weightG = weightMatch ? parseInt(weightMatch[1]) * 1000 : 1000;

  const colors = ['black', 'white', 'grey', 'gray', 'red', 'blue', 'green', 'yellow', 'orange',
    'purple', 'pink', 'brown', 'clear', 'natural', 'wood', 'marble', 'gold', 'silver'];
  let color = '';
  for (const c of colors) {
    if (parts.includes(c)) {
      color = c.charAt(0).toUpperCase() + c.slice(1);
      break;
    }
  }

  return {
    brand: 'Bambu Lab',
    material,
    color,
    weightTotalG: weightG,
    weightRemainingG: weightG,
    costPerSpool: 0,
    purchasedAt: new Date().toISOString().slice(0, 10),
  };
}

function parseUpcResponse(data: unknown): UpcLookupResult | null {
  const d = data as { code?: string; items?: Array<{ title?: string; brand?: string; description?: string }> };
  if (d.code !== 'OK' || !d.items?.length) return null;
  const item = d.items[0];
  const title = (item.title ?? '').toLowerCase();

  const materials = ['pla', 'petg', 'abs', 'tpu', 'asa', 'pa'];
  let material = 'PLA';
  let confidence: 'high' | 'medium' | 'low' = 'low';
  for (const m of materials) {
    if (title.includes(m)) {
      material = m.toUpperCase();
      confidence = 'medium';
      break;
    }
  }

  const weightMatch = title.match(/(\d+)\s*g\b/) ?? title.match(/(\d+)\s*kg/);
  let weightG = 1000;
  if (weightMatch) {
    weightG = title.includes('kg') ? parseInt(weightMatch[1]) * 1000 : parseInt(weightMatch[1]);
    if (confidence !== 'low') confidence = 'high';
  }

  const brand = item.brand ?? (d.items[0].title?.split(' ')[0] ?? 'Unknown');

  return { brand, material, weightG, confidence, rawTitle: item.title ?? '' };
}

// ── Corner brackets overlay ───────────────────────────────────────────────────

function CornerBrackets({ scanning }: { scanning: boolean }) {
  const cls = scanning ? 'animate-pulse' : '';
  const color = 'border-[#f97316]';
  const size = 'w-14 h-14';
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className={`relative w-64 h-64 ${cls}`}>
        <div className={`absolute top-0 left-0 ${size} border-t-4 border-l-4 ${color} rounded-tl-lg`} />
        <div className={`absolute top-0 right-0 ${size} border-t-4 border-r-4 ${color} rounded-tr-lg`} />
        <div className={`absolute bottom-0 left-0 ${size} border-b-4 border-l-4 ${color} rounded-bl-lg`} />
        <div className={`absolute bottom-0 right-0 ${size} border-b-4 border-r-4 ${color} rounded-br-lg`} />
      </div>
    </div>
  );
}

// ── Permission error UI ───────────────────────────────────────────────────────

function PermissionError({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  let message = 'An error occurred starting the camera.';
  let detail = '';

  if (error === 'camera-denied') {
    message = 'Camera access was denied.';
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) {
      detail = 'Enable camera in Settings → Safari → Camera';
    } else if (/Android/.test(ua)) {
      detail = 'Tap the camera icon in the address bar to allow access';
    } else {
      detail = 'Allow camera access in your browser settings and try again.';
    }
  } else if (error === 'no-camera') {
    message = 'No camera detected on this device.';
    detail = 'Connect a camera and try again.';
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-3xl">📷</div>
      <div>
        <p className="text-white font-semibold text-base mb-1">{message}</p>
        {detail && <p className="text-white/60 text-sm">{detail}</p>}
      </div>
      <button
        onClick={onRetry}
        className="mt-2 px-6 py-3 bg-[#f97316] text-white rounded-xl font-medium text-sm"
      >
        Try Again
      </button>
    </div>
  );
}

// ── New Spool Detected card ───────────────────────────────────────────────────

function NewSpoolCard({
  detected,
  onAdd,
  onManual,
  onDismiss,
}: {
  detected: NewSpoolDetected;
  onAdd: () => void;
  onManual: () => void;
  onDismiss: () => void;
}) {
  const confidenceColor =
    detected.confidence === 'high' ? 'text-emerald-400' :
    detected.confidence === 'medium' ? 'text-amber-400' :
    'text-red-400';

  return (
    <div className="absolute inset-x-0 bottom-0 bg-[#1e2a3a] rounded-t-2xl p-5 pb-safe space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">New Spool Detected</p>
          <p className="text-white font-semibold text-base">{detected.brand} {detected.material}</p>
          <p className="text-white/60 text-xs mt-0.5">{detected.rawTitle}</p>
        </div>
        <button onClick={onDismiss} className="text-white/40 text-xl p-1">×</button>
      </div>
      <div className="flex gap-4 text-xs">
        <div>
          <p className="text-white/40">Weight</p>
          <p className="text-white font-medium">{detected.weightG}g</p>
        </div>
        <div>
          <p className="text-white/40">Source</p>
          <p className="text-white font-medium capitalize">{detected.source}</p>
        </div>
        <div>
          <p className="text-white/40">Confidence</p>
          <p className={`font-medium capitalize ${confidenceColor}`}>{detected.confidence}</p>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onManual}
          className="flex-1 py-3.5 rounded-xl border border-white/20 text-white text-sm font-medium"
        >
          Edit First
        </button>
        <button
          onClick={onAdd}
          className="flex-1 py-3.5 rounded-xl bg-[#f97316] text-white text-sm font-medium"
        >
          Add to Inventory
        </button>
      </div>
    </div>
  );
}

// ── Add Spool inline mini-form ────────────────────────────────────────────────

const MATERIALS = [
  'PLA Basic', 'PLA Matte', 'PLA Silk', 'PLA+', 'PLA (Generic)',
  'PETG Basic', 'PETG (Generic)',
  'ABS', 'ASA', 'TPU 95A', 'TPU (Generic)', 'PA (Nylon)', 'Other',
];

function AddSpoolSheet({
  prefill,
  onSave,
  onClose,
}: {
  prefill: Partial<Omit<FilamentSpool, 'id'>>;
  onSave: (spool: Omit<FilamentSpool, 'id'>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    brand: prefill.brand ?? '',
    material: prefill.material ?? 'PLA Basic',
    color: prefill.color ?? '',
    colorHex: prefill.colorHex ?? '#ffffff',
    weightTotalG: prefill.weightTotalG ?? 1000,
    weightRemainingG: prefill.weightRemainingG ?? prefill.weightTotalG ?? 1000,
    costPerSpool: prefill.costPerSpool ?? 0,
    purchasedAt: prefill.purchasedAt ?? new Date().toISOString().slice(0, 10),
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brand.trim() || !form.color.trim()) return;
    onSave({ ...form, notes: '', locationId: undefined });
  }

  const inp = 'w-full bg-white/10 text-white text-sm border border-white/20 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#f97316] placeholder:text-white/30';
  const label = 'block text-xs font-medium text-white/60 mb-1';

  return (
    <div className="absolute inset-x-0 bottom-0 bg-[#1e2a3a] rounded-t-2xl p-5 pb-safe overflow-y-auto max-h-[80vh]">
      <div className="flex items-center justify-between mb-4">
        <p className="text-white font-semibold">Add New Spool</p>
        <button onClick={onClose} className="text-white/40 text-xl p-1">×</button>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Brand *</label>
            <input className={inp} value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="e.g. Bambu Lab" />
          </div>
          <div>
            <label className={label}>Material</label>
            <select className={inp} value={form.material} onChange={(e) => set('material', e.target.value)}>
              {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Color Name *</label>
            <input className={inp} value={form.color} onChange={(e) => set('color', e.target.value)} placeholder="e.g. Galaxy Black" />
          </div>
          <div>
            <label className={label}>Color Hex</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={form.colorHex} onChange={(e) => set('colorHex', e.target.value)}
                className="h-10 w-10 rounded-lg border border-white/20 bg-transparent cursor-pointer shrink-0" />
              <input className={inp} value={form.colorHex} onChange={(e) => set('colorHex', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Total Weight (g)</label>
            <input type="number" className={inp} value={form.weightTotalG}
              onChange={(e) => set('weightTotalG', Number(e.target.value))} min={1} />
          </div>
          <div>
            <label className={label}>Cost ($)</label>
            <input type="number" className={inp} value={form.costPerSpool}
              onChange={(e) => set('costPerSpool', Number(e.target.value))} min={0} step={0.01} />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-3.5 rounded-xl border border-white/20 text-white text-sm font-medium">
            Cancel
          </button>
          <button type="submit"
            className="flex-1 py-3.5 rounded-xl bg-[#f97316] text-white text-sm font-medium">
            Add Spool
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Unknown scan card ─────────────────────────────────────────────────────────

function UnknownScanCard({ text, onAdd, onDismiss }: { text: string; onAdd: () => void; onDismiss: () => void }) {
  return (
    <div className="absolute inset-x-0 bottom-0 bg-[#1e2a3a] rounded-t-2xl p-5 pb-safe">
      <div className="flex items-start justify-between mb-3">
        <p className="text-white font-semibold">Unrecognized Barcode</p>
        <button onClick={onDismiss} className="text-white/40 text-xl p-1">×</button>
      </div>
      <p className="text-white/50 text-xs mb-4 font-mono break-all">{text.slice(0, 80)}</p>
      <button onClick={onAdd}
        className="w-full py-3.5 rounded-xl bg-[#f97316] text-white text-sm font-medium">
        Add Manually
      </button>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

type UpcState = 'idle' | 'loading' | 'found' | 'rate-limited' | 'not-found';

export default function QRScannerModal({ onClose }: Props) {
  const navigate = useNavigate();
  const addSpool = useFilamentStore((s) => s.addSpool);

  const [tab, setTab] = useState<ScanTab>('my-spools');
  const tabRef = useRef<ScanTab>('my-spools');
  useEffect(() => { tabRef.current = tab; }, [tab]);

  // New-spool tab state
  const [upcState, setUpcState] = useState<UpcState>('idle');
  const [detected, setDetected] = useState<NewSpoolDetected | null>(null);
  const [unknownText, setUnknownText] = useState<string | null>(null);
  const [addSpoolSheet, setAddSpoolSheet] = useState<AddSpoolModalState>({ open: false, prefill: null });

  // Prevent duplicate scans
  const lastScanRef = useRef<string>('');
  const cooldownRef = useRef(false);

  const handleResult = useCallback(async (text: string) => {
    if (cooldownRef.current || text === lastScanRef.current) return;
    lastScanRef.current = text;
    cooldownRef.current = true;
    setTimeout(() => { cooldownRef.current = false; }, 2500);

    if (tabRef.current === 'my-spools') {
      if (isTactileQr(text)) {
        const url = new URL(text.startsWith('http') ? text : `https://placeholder${text}`);
        const spoolId = url.searchParams.get('spoolId');
        const skuId = url.searchParams.get('skuId');
        const type = url.searchParams.get('type');
        if (spoolId) {
          onClose();
          navigate(`/scan?spoolId=${encodeURIComponent(spoolId)}&type=${type ?? 'filament'}`);
        } else if (skuId) {
          onClose();
          navigate(`/scan?skuId=${encodeURIComponent(skuId)}&type=${type ?? 'product'}`);
        }
      } else {
        // Non-Tactile QR — ignore for My Spools tab
      }
      return;
    }

    // ── New Spool tab ──────────────────────────────────────────────────────────
    if (isBambuUrl(text)) {
      const prefill = parseBambuUrl(text);
      setDetected({
        brand: prefill.brand ?? 'Bambu Lab',
        material: prefill.material ?? 'PLA',
        weightG: prefill.weightTotalG ?? 1000,
        confidence: 'medium',
        rawTitle: text.split('/').pop() ?? text,
        source: 'bambu',
      });
      return;
    }

    if (isUpc(text)) {
      setUpcState('loading');
      try {
        const res = await fetch(
          `https://api.upcitemdb.com/prod/trial/lookup?upc=${text.trim()}`
        );
        if (res.status === 429) {
          setUpcState('rate-limited');
          setAddSpoolSheet({ open: true, prefill: {} });
          return;
        }
        const json = await res.json();
        const result = parseUpcResponse(json);
        if (result) {
          setDetected({
            brand: result.brand,
            material: result.material,
            weightG: result.weightG,
            confidence: result.confidence,
            rawTitle: result.rawTitle,
            source: 'upc',
          });
          setUpcState('found');
        } else {
          setUpcState('not-found');
          setUnknownText(text);
        }
      } catch {
        setUpcState('not-found');
        setUnknownText(text);
      }
      return;
    }

    // Truly unknown
    setUnknownText(text);
  }, [navigate, onClose]);

  const { start, stop, state, error } = useQRScanner({
    onResult: handleResult,
    elementId: 'qr-reader',
  });

  // Start scanner when modal mounts; restart when tab changes
  const prevTabRef = useRef<ScanTab | null>(null);
  useEffect(() => {
    if (prevTabRef.current !== null) {
      // Tab changed — reset result state and restart
      setDetected(null);
      setUnknownText(null);
      setUpcState('idle');
      setAddSpoolSheet({ open: false, prefill: null });
      lastScanRef.current = '';
    }
    prevTabRef.current = tab;
    // Slight delay to let DOM settle on tab switch
    const t = setTimeout(() => { start(); }, 50);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleAddDetected() {
    if (!detected) return;
    const prefill: Partial<Omit<FilamentSpool, 'id'>> = {
      brand: detected.brand,
      material: detected.material,
      weightTotalG: detected.weightG,
      weightRemainingG: detected.weightG,
      costPerSpool: 0,
      purchasedAt: new Date().toISOString().slice(0, 10),
    };
    addSpool({ ...prefill, color: '', notes: '', locationId: undefined } as Omit<FilamentSpool, 'id'>);
    setDetected(null);
    lastScanRef.current = '';
    onClose();
    navigate('/filament');
  }

  function handleOpenAddSheet(prefill?: Partial<Omit<FilamentSpool, 'id'>>) {
    setAddSpoolSheet({ open: true, prefill: prefill ?? detected ? {
      brand: detected?.brand,
      material: detected?.material,
      weightTotalG: detected?.weightG,
      weightRemainingG: detected?.weightG,
    } : {} });
    setDetected(null);
    setUnknownText(null);
  }

  function handleAddSpoolSave(spool: Omit<FilamentSpool, 'id'>) {
    addSpool(spool);
    setAddSpoolSheet({ open: false, prefill: null });
    onClose();
    navigate('/filament');
  }

  const isScanning = state === 'scanning';
  const isError = state === 'error';

  const tabBtn = (t: ScanTab, label: string) => (
    <button
      key={t}
      onClick={async () => { await stop(); setTab(t); }}
      className={[
        'flex-1 py-3 text-sm font-medium transition-colors border-b-2',
        tab === t
          ? 'border-[#f97316] text-[#f97316]'
          : 'border-transparent text-white/50 hover:text-white',
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe-or-4 pb-3 bg-[#1e2a3a] shrink-0">
        <button onClick={onClose} className="text-white/70 hover:text-white text-sm px-2 py-1 -ml-2">
          ← Back
        </button>
        <h2 className="text-white font-semibold text-sm">Scan Code</h2>
        <div className="w-16" />
      </div>

      {/* Tabs */}
      <div className="flex bg-[#1e2a3a] shrink-0">
        {tabBtn('my-spools', '📦 My Spools')}
        {tabBtn('new-spool', '➕ New Spool')}
      </div>

      {/* Camera area */}
      <div className="flex-1 relative overflow-hidden bg-black">
        {isError ? (
          <PermissionError error={error} onRetry={start} />
        ) : (
          <>
            {/* html5-qrcode attaches here */}
            <div
              id="qr-reader"
              className="w-full h-full"
              style={{ minHeight: '300px' }}
            />
            <CornerBrackets scanning={isScanning} />
          </>
        )}

        {/* UPC loading spinner */}
        {upcState === 'loading' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-[#f97316] border-t-transparent rounded-full animate-spin" />
            <p className="text-white text-sm">Looking up barcode…</p>
          </div>
        )}

        {/* Rate limited */}
        {upcState === 'rate-limited' && (
          <div className="absolute inset-x-4 bottom-24 bg-amber-900/90 rounded-xl p-4 text-center">
            <p className="text-amber-300 text-sm font-medium">Lookup limit reached — enter manually</p>
          </div>
        )}

        {/* New spool card */}
        {detected && !addSpoolSheet.open && (
          <NewSpoolCard
            detected={detected}
            onAdd={handleAddDetected}
            onManual={() => handleOpenAddSheet()}
            onDismiss={() => { setDetected(null); lastScanRef.current = ''; }}
          />
        )}

        {/* Unknown scan card */}
        {unknownText && !addSpoolSheet.open && !detected && (
          <UnknownScanCard
            text={unknownText}
            onAdd={() => handleOpenAddSheet({})}
            onDismiss={() => { setUnknownText(null); lastScanRef.current = ''; }}
          />
        )}

        {/* Add spool sheet */}
        {addSpoolSheet.open && (
          <AddSpoolSheet
            prefill={addSpoolSheet.prefill ?? {}}
            onSave={handleAddSpoolSave}
            onClose={() => setAddSpoolSheet({ open: false, prefill: null })}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="bg-[#1e2a3a] px-4 py-3 pb-safe-or-3 text-center shrink-0">
        {state === 'starting' && (
          <p className="text-white/50 text-xs">Starting camera…</p>
        )}
        {isScanning && tab === 'my-spools' && (
          <p className="text-white/50 text-xs">Point at a Tactile Creations QR label</p>
        )}
        {isScanning && tab === 'new-spool' && (
          <p className="text-white/50 text-xs">Point at a filament box barcode or Bambu QR</p>
        )}
        {state === 'idle' && !isError && (
          <p className="text-white/30 text-xs">Camera stopped</p>
        )}
      </div>
    </div>
  );
}
